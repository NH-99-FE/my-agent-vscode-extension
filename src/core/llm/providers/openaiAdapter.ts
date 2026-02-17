import type { LlmChatMessage, LlmStreamEvent, LlmStreamRequest } from '../client'
import { assertNotCancelled } from '../cancellation'
import { LlmAbortError, LlmProviderError, LlmTimeoutError } from '../errors'
import type { ProviderAdapter } from './types'

interface OpenAIClientLike {
  chat: {
    completions: {
      create(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<AsyncIterable<unknown>>
    }
  }
}

export class OpenAIProviderAdapter implements ProviderAdapter {
  async *streamChat(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
    assertNotCancelled(request.signal)

    const model = request.model.trim()
    if (!model) {
      throw new LlmProviderError({
        code: 'invalid_request',
        provider: 'openai',
        retryable: false,
        message: 'OpenAI model is required.',
      })
    }

    if (!request.apiKey) {
      throw new LlmProviderError({
        code: 'auth_failed',
        provider: 'openai',
        retryable: false,
        message: 'OpenAI API key is missing.',
      })
    }

    const normalizedBaseUrl = normalizeBaseUrl(request.baseUrl)
    const client = await createOpenAIClient(request.apiKey, request.timeoutMs, normalizedBaseUrl)
    const abortController = createAbortController()
    // 将扩展内部取消信号桥接到 OpenAI SDK 请求取消。
    const offCancel = request.signal?.onCancel(reason => {
      abortController?.abort()
      if (reason) {
        // 保留 reason 语义，后续映射到 LlmAbortError/LlmTimeoutError。
      }
    })

    let finishReason: 'stop' | 'length' | 'cancelled' | 'error' = 'stop'

    try {
      const stream = await client.chat.completions.create(
        {
          model,
          stream: true,
          messages: toOpenAiMessages(request.messages),
          reasoning_effort: mapReasoningLevel(request.reasoningLevel),
        },
        abortController ? { signal: abortController.signal } : undefined
      )

      for await (const chunk of stream) {
        assertNotCancelled(request.signal)
        const parsed = parseOpenAiChunk(chunk)
        // 只向上游抛出文本增量，保持与既有 chat.delta 协议一致。
        if (parsed.delta) {
          yield { type: 'text-delta', delta: parsed.delta }
        }
        if (parsed.finishReason) {
          finishReason = parsed.finishReason
        }
      }

      assertNotCancelled(request.signal)
      yield { type: 'done', finishReason }
    } catch (error) {
      // SDK/网络/鉴权等错误统一归一化，避免上层分散处理。
      throw normalizeOpenAiError(error, request.signal?.reason)
    } finally {
      offCancel?.()
    }
  }
}

async function createOpenAIClient(apiKey: string, timeoutMs?: number, baseUrl?: string): Promise<OpenAIClientLike> {
  try {
    // 用动态导入避免在扩展编译阶段耦合 SDK 类型细节。
    const moduleName: string = 'openai'
    const loaded = (await import(moduleName)) as Record<string, unknown>
    const OpenAI = (loaded.default ?? loaded.OpenAI) as (new (options: Record<string, unknown>) => OpenAIClientLike) | undefined

    if (!OpenAI) {
      throw new Error('OpenAI SDK entry is unavailable.')
    }

    const options: Record<string, unknown> = { apiKey }
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      options.timeout = timeoutMs
    }
    if (baseUrl) {
      options.baseURL = baseUrl
    }
    return new OpenAI(options)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load OpenAI SDK.'
    throw new LlmProviderError({
      code: 'provider_unavailable',
      provider: 'openai',
      retryable: false,
      message,
    })
  }
}

function toOpenAiMessages(messages: LlmChatMessage[]): Array<{ role: string; content: string }> {
  const mapped: Array<{ role: string; content: string }> = []
  for (const message of messages) {
    if (message.role === 'tool') {
      continue
    }
    mapped.push({
      role: message.role,
      content: message.content,
    })
  }
  return mapped
}

function parseOpenAiChunk(value: unknown): {
  delta?: string
  finishReason?: 'stop' | 'length' | 'cancelled' | 'error'
} {
  if (typeof value !== 'object' || value === null) {
    return {}
  }
  const chunk = value as Record<string, unknown>
  const choices = Array.isArray(chunk.choices) ? chunk.choices : []
  const choice = choices[0]
  if (typeof choice !== 'object' || choice === null) {
    return {}
  }

  const typedChoice = choice as Record<string, unknown>
  const deltaObj = typedChoice.delta
  const delta =
    typeof deltaObj === 'object' && deltaObj !== null && typeof (deltaObj as Record<string, unknown>).content === 'string'
      ? ((deltaObj as Record<string, unknown>).content as string)
      : undefined

  const finishReasonRaw = typedChoice.finish_reason
  // 只映射本协议支持的结束原因，未知值由默认 stop 收敛。
  const finishReason =
    finishReasonRaw === 'length'
      ? 'length'
      : finishReasonRaw === 'stop'
        ? 'stop'
        : finishReasonRaw === 'content_filter'
          ? 'error'
          : undefined

  return {
    ...(delta ? { delta } : {}),
    ...(finishReason ? { finishReason } : {}),
  }
}

function mapReasoningLevel(level: LlmStreamRequest['reasoningLevel']): 'low' | 'medium' | 'high' {
  // 协议有 ultra，OpenAI 当前仅到 high，这里做向下兼容映射。
  if (level === 'ultra') {
    return 'high'
  }
  return level
}

function createAbortController(): { signal: unknown; abort: () => void } | undefined {
  const ctor = (globalThis as Record<string, unknown>).AbortController
  if (typeof ctor !== 'function') {
    return undefined
  }
  return new (ctor as new () => { signal: unknown; abort: () => void })()
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const isHttpUrl = /^https?:\/\/[^\s]+$/i.test(trimmed)
  if (!isHttpUrl) {
    throw new LlmProviderError({
      code: 'invalid_request',
      provider: 'openai',
      retryable: false,
      message: 'OpenAI baseUrl is invalid.',
    })
  }
  return trimmed
}

function normalizeOpenAiError(error: unknown, cancelReason?: string): Error {
  if (error instanceof LlmAbortError || error instanceof LlmTimeoutError || error instanceof LlmProviderError) {
    return error
  }

  if (cancelReason === '__timeout__') {
    return new LlmTimeoutError('LLM request timed out.')
  }
  if (cancelReason) {
    return new LlmAbortError(cancelReason)
  }

  const status = getStatusCode(error)
  const message = error instanceof Error ? error.message : 'OpenAI request failed.'

  if (status === 401 || status === 403) {
    return new LlmProviderError({
      code: 'auth_failed',
      provider: 'openai',
      retryable: false,
      statusCode: status,
      message: 'OpenAI authentication failed. Please check API key.',
    })
  }

  if (status === 429) {
    return new LlmProviderError({
      code: 'rate_limited',
      provider: 'openai',
      retryable: true,
      statusCode: status,
      message: 'OpenAI rate limit reached. Please retry later.',
    })
  }

  if (typeof status === 'number' && status >= 500) {
    return new LlmProviderError({
      code: 'provider_unavailable',
      provider: 'openai',
      retryable: true,
      statusCode: status,
      message: 'OpenAI service is temporarily unavailable.',
    })
  }

  if (message.toLowerCase().includes('timeout')) {
    return new LlmTimeoutError('LLM request timed out.')
  }

  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return new LlmProviderError({
      code: 'network_error',
      provider: 'openai',
      retryable: true,
      message: 'Network error while calling OpenAI.',
    })
  }

  return new LlmProviderError({
    code: 'invalid_request',
    provider: 'openai',
    retryable: false,
    message,
  })
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }
  const maybeStatus = (error as Record<string, unknown>).status
  if (typeof maybeStatus === 'number') {
    return maybeStatus
  }
  return undefined
}
