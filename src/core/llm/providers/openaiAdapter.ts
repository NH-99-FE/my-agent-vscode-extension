import type { LlmChatMessage, LlmStreamEvent, LlmStreamRequest, LlmToolCall } from '../client'
import { assertNotCancelled, HARD_TIMEOUT_REASON, IDLE_TIMEOUT_REASON } from '../cancellation'
import { LlmAbortError, LlmProviderError, LlmTimeoutError } from '../errors'
import type { ProviderAdapter } from './types'

interface OpenAIClientLike {
  chat: {
    completions: {
      create(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<AsyncIterable<unknown>>
    }
  }
}

interface ToolCallDelta {
  index: number
  id?: string
  name?: string
  argumentsChunk?: string
}

interface ToolCallAccumulator {
  id?: string
  name?: string
  argumentsText: string
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
    const client = await createOpenAIClient(request.apiKey, normalizedBaseUrl)
    const abortController = createAbortController()
    // 将扩展内部取消信号桥接到 OpenAI SDK 请求取消。
    const offCancel = request.signal?.onCancel(reason => {
      abortController?.abort()
      if (reason) {
        // 保留 reason 语义，后续映射到 LlmAbortError/LlmTimeoutError。
      }
    })

    let finishReason: 'stop' | 'length' | 'cancelled' | 'error' = 'stop'
    const toolCallsByIndex = new Map<number, ToolCallAccumulator>()

    try {
      const createParams: Record<string, unknown> = {
        model,
        stream: true,
        messages: toOpenAiMessages(request.messages),
        reasoning_effort: mapReasoningLevel(request.reasoningLevel),
      }
      if (request.tools && request.tools.length > 0) {
        createParams.tools = request.tools
        createParams.tool_choice = 'auto'
      }

      const stream = await client.chat.completions.create(createParams, abortController ? { signal: abortController.signal } : undefined)

      for await (const chunk of stream) {
        assertNotCancelled(request.signal)
        const parsed = parseOpenAiChunk(chunk)
        if (parsed.delta) {
          yield { type: 'text-delta', delta: parsed.delta }
        }
        if (parsed.toolCallDeltas.length > 0) {
          mergeToolCallDeltas(toolCallsByIndex, parsed.toolCallDeltas)
        }
        if (parsed.finishReason) {
          finishReason = parsed.finishReason
        }
      }

      assertNotCancelled(request.signal)
      const toolCalls = resolveToolCalls(toolCallsByIndex)
      if (toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          yield {
            type: 'tool-call',
            callId: toolCall.id,
            toolName: toolCall.name,
            argumentsJson: toolCall.argumentsJson,
          }
        }
        return
      }

      yield { type: 'done', finishReason }
    } catch (error) {
      // SDK/网络/鉴权等错误统一归一化，避免上层分散处理。
      throw normalizeOpenAiError(error, request.signal?.reason)
    } finally {
      offCancel?.()
    }
  }
}

async function createOpenAIClient(apiKey: string, baseUrl?: string): Promise<OpenAIClientLike> {
  try {
    // 用动态导入避免在扩展编译阶段耦合 SDK 类型细节。
    const moduleName: string = 'openai'
    const loaded = (await import(moduleName)) as Record<string, unknown>
    const OpenAI = (loaded.default ?? loaded.OpenAI) as (new (options: Record<string, unknown>) => OpenAIClientLike) | undefined

    if (!OpenAI) {
      throw new Error('OpenAI SDK entry is unavailable.')
    }

    const options: Record<string, unknown> = { apiKey }
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

function toOpenAiMessages(messages: LlmChatMessage[]): Array<Record<string, unknown>> {
  const mapped: Array<Record<string, unknown>> = []
  for (const message of messages) {
    if (message.role === 'tool') {
      if (!message.toolCallId) {
        continue
      }
      mapped.push({
        role: 'tool',
        content: message.content,
        tool_call_id: message.toolCallId,
      })
      continue
    }

    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      mapped.push({
        role: 'assistant',
        content: message.content.trim().length > 0 ? message.content : null,
        tool_calls: message.toolCalls.map(toolCall => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: toolCall.argumentsJson,
          },
        })),
      })
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
  toolCallDeltas: ToolCallDelta[]
} {
  if (typeof value !== 'object' || value === null) {
    return { toolCallDeltas: [] }
  }
  const chunk = value as Record<string, unknown>
  const choices = Array.isArray(chunk.choices) ? chunk.choices : []
  const choice = choices[0]
  if (typeof choice !== 'object' || choice === null) {
    return { toolCallDeltas: [] }
  }

  const typedChoice = choice as Record<string, unknown>
  const deltaObj = typedChoice.delta
  const deltaRecord = typeof deltaObj === 'object' && deltaObj !== null ? (deltaObj as Record<string, unknown>) : undefined
  const delta = typeof deltaRecord?.content === 'string' ? (deltaRecord.content as string) : undefined
  const toolCallDeltas = parseToolCallDeltas(deltaRecord?.tool_calls)

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
    toolCallDeltas,
  }
}

function parseToolCallDeltas(value: unknown): ToolCallDelta[] {
  if (!Array.isArray(value)) {
    return []
  }

  const deltas: ToolCallDelta[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      continue
    }

    const typed = item as Record<string, unknown>
    const index = typed.index
    if (typeof index !== 'number' || !Number.isFinite(index) || index < 0) {
      continue
    }

    const functionObject = typed.function
    const functionRecord =
      typeof functionObject === 'object' && functionObject !== null ? (functionObject as Record<string, unknown>) : undefined
    const id = typeof typed.id === 'string' ? typed.id : undefined
    const name = typeof functionRecord?.name === 'string' ? (functionRecord.name as string) : undefined
    const argumentsChunk = typeof functionRecord?.arguments === 'string' ? (functionRecord.arguments as string) : undefined

    deltas.push({
      index,
      ...(id ? { id } : {}),
      ...(name ? { name } : {}),
      ...(argumentsChunk ? { argumentsChunk } : {}),
    })
  }

  return deltas
}

function mergeToolCallDeltas(accumulator: Map<number, ToolCallAccumulator>, deltas: ToolCallDelta[]): void {
  for (const delta of deltas) {
    const existing = accumulator.get(delta.index) ?? { argumentsText: '' }
    if (delta.id) {
      existing.id = delta.id
    }
    if (delta.name) {
      existing.name = delta.name
    }
    if (delta.argumentsChunk) {
      existing.argumentsText += delta.argumentsChunk
    }
    accumulator.set(delta.index, existing)
  }
}

function resolveToolCalls(accumulator: Map<number, ToolCallAccumulator>): LlmToolCall[] {
  if (accumulator.size === 0) {
    return []
  }

  const resolved: LlmToolCall[] = []
  const ordered = [...accumulator.entries()].sort(([left], [right]) => left - right)
  for (const [index, toolCall] of ordered) {
    if (!toolCall.name) {
      continue
    }
    resolved.push({
      id: toolCall.id ?? `tool-call-${index}`,
      name: toolCall.name,
      argumentsJson: toolCall.argumentsText.trim() || '{}',
    })
  }
  return resolved
}

function mapReasoningLevel(level: LlmStreamRequest['reasoningLevel']): 'low' | 'medium' | 'high' | 'xhigh' {
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

  if (cancelReason === IDLE_TIMEOUT_REASON) {
    return new LlmTimeoutError('LLM stream idle timed out.')
  }
  if (cancelReason === HARD_TIMEOUT_REASON || cancelReason === '__timeout__') {
    return new LlmTimeoutError('LLM request exceeded max duration.')
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
    return new LlmProviderError({
      code: 'timeout',
      provider: 'openai',
      retryable: true,
      message: 'OpenAI request timed out.',
    })
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
