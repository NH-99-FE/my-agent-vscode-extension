/**
 * LLM 提供方枚举。
 * 目前先提供 mock，后续可扩展 openai/anthropic。
 */
export type LlmProvider = 'mock'

/**
 * 聊天消息输入结构（扩展侧内部使用）。
 */
export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

/**
 * 流式调用请求参数。
 */
export interface LlmStreamRequest {
  provider: LlmProvider
  model: string
  sessionId: string
  messages: LlmChatMessage[]
  temperature?: number
  /**
   * 超时时间（毫秒）。
   */
  timeoutMs?: number
  /**
   * 最大重试次数（不含首次）。
   */
  maxRetries?: number
  /**
   * 重试前等待时间（毫秒）。
   */
  retryDelayMs?: number
  /**
   * 可选取消信号（由上层触发）。
   */
  signal?: LlmCancellationSignal
}

/**
 * 流式输出事件。
 */
export type LlmStreamEvent =
  | {
      type: 'text-delta'
      delta: string
    }
  | {
      type: 'done'
      finishReason: 'stop' | 'length' | 'cancelled' | 'error'
    }
  | {
      type: 'error'
      message: string
    }

/**
 * LLM 客户端统一接口。
 */
export interface LlmClient {
  streamChat(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent>
}

/**
 * 轻量取消信号。
 */
export interface LlmCancellationSignal {
  readonly aborted: boolean
  readonly reason: string | undefined
  onCancel(listener: (reason?: string) => void): () => void
}

/**
 * 轻量取消控制器。
 */
export class LlmCancellationController {
  private cancelled = false
  private cancelReason: string | undefined
  private listeners = new Set<(reason?: string) => void>()

  readonly signal: LlmCancellationSignal

  constructor() {
    const getCancelled = () => this.cancelled
    const getCancelReason = () => this.cancelReason
    const addListener = (listener: (reason?: string) => void) => {
      this.listeners.add(listener)
    }
    const removeListener = (listener: (reason?: string) => void) => {
      this.listeners.delete(listener)
    }

    this.signal = {
      get aborted() {
        return getCancelled()
      },
      get reason() {
        return getCancelReason()
      },
      onCancel(listener: (reason?: string) => void): () => void {
        addListener(listener)
        return () => {
          removeListener(listener)
        }
      },
    }
  }

  cancel(reason?: string): void {
    if (this.cancelled) {
      return
    }
    this.cancelled = true
    this.cancelReason = reason

    for (const listener of this.listeners) {
      listener(reason)
    }
    this.listeners.clear()
  }
}

export class LlmAbortError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmAbortError'
  }
}

export class LlmTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmTimeoutError'
  }
}

interface LlmProviderAdapter {
  streamChat(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent>
}

// 统一的“超时取消”内部原因码，用于区分用户取消 vs 超时。
const TIMEOUT_REASON = '__timeout__'

/**
 * Mock provider：用于打通流式链路，不依赖外部网络。
 */
export class MockLlmProvider implements LlmProviderAdapter {
  async *streamChat(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
    const userPrompt = getLastUserMessage(request.messages)
    const responseText = buildMockResponse(userPrompt, request.model)
    const tokens = tokenizeForStreaming(responseText)

    for (const token of tokens) {
      assertNotCancelled(request.signal)
      await sleep(15, request.signal)
      yield { type: 'text-delta', delta: token }
    }

    assertNotCancelled(request.signal)
    yield { type: 'done', finishReason: 'stop' }
  }
}

/**
 * 客户端工厂：当前只注册 mock provider。
 */
export function createLlmClient(): LlmClient {
  return new DefaultLlmClient({
    mock: new MockLlmProvider(),
  })
}

class DefaultLlmClient implements LlmClient {
  constructor(private readonly providers: Record<LlmProvider, LlmProviderAdapter>) {}

  async *streamChat(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
    const provider = this.providers[request.provider]
    if (!provider) {
      throw new Error(`Unsupported provider: ${request.provider}`)
    }

    const maxRetries = request.maxRetries ?? 1
    const retryDelayMs = request.retryDelayMs ?? 250

    // 重试策略：首次 + maxRetries 次，除取消/超时外错误都可重试。
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const timeoutController = createTimeoutController(request.timeoutMs)
      const mergedSignal = mergeSignals(request.signal, timeoutController.signal)

      try {
        const nextRequest: LlmStreamRequest = {
          ...request,
          ...(mergedSignal ? { signal: mergedSignal } : {}),
        }

        for await (const event of provider.streamChat(nextRequest)) {
          yield event
        }
        return
      } catch (error) {
        // 取消与超时属于终止条件，不做重试，直接抛出给上层处理。
        if (error instanceof LlmAbortError || error instanceof LlmTimeoutError) {
          throw error
        }

        const isLastAttempt = attempt >= maxRetries
        if (isLastAttempt) {
          throw error
        }

        await sleep(retryDelayMs, request.signal)
      } finally {
        // 无论成功失败都主动释放超时控制器，避免定时器泄漏。
        timeoutController.cancel('dispose')
      }
    }
  }
}

function createTimeoutController(timeoutMs?: number): LlmCancellationController {
  const controller = new LlmCancellationController()
  if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
    return controller
  }

  const handle = setTimeout(() => {
    // 通过 cancel(reason) 注入超时语义，后续在 assertNotCancelled 中映射为 TimeoutError。
    controller.cancel(TIMEOUT_REASON)
  }, timeoutMs)

  controller.signal.onCancel(() => {
    clearTimeout(handle)
  })

  return controller
}

function mergeSignals(
  primary?: LlmCancellationSignal,
  secondary?: LlmCancellationSignal,
): LlmCancellationSignal | undefined {
  if (!primary && !secondary) {
    return undefined
  }

  const merged = new LlmCancellationController()
  // 任一上游信号取消，合并信号立即取消。
  const offPrimary = primary?.onCancel((reason) => {
    merged.cancel(reason)
  })
  const offSecondary = secondary?.onCancel((reason) => {
    merged.cancel(reason)
  })

  if (primary?.aborted) {
    merged.cancel(primary.reason)
  }
  if (secondary?.aborted) {
    merged.cancel(secondary.reason)
  }

  merged.signal.onCancel(() => {
    // 合并信号结束时主动反注册上游监听，避免监听器残留。
    offPrimary?.()
    offSecondary?.()
  })

  return merged.signal
}

function assertNotCancelled(signal?: LlmCancellationSignal): void {
  if (!signal?.aborted) {
    return
  }
  if (signal.reason === TIMEOUT_REASON) {
    throw new LlmTimeoutError('LLM request timed out.')
  }
  throw new LlmAbortError(signal.reason ?? 'LLM request cancelled.')
}

async function sleep(ms: number, signal?: LlmCancellationSignal): Promise<void> {
  assertNotCancelled(signal)

  await new Promise<void>((resolve, reject) => {
    const handle = setTimeout(() => {
      offCancel?.()
      resolve()
    }, Math.max(0, ms))

    const offCancel = signal?.onCancel((reason) => {
      clearTimeout(handle)
      reject(new LlmAbortError(reason ?? 'LLM request cancelled.'))
    })
  })
}

function getLastUserMessage(messages: LlmChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message?.role === 'user') {
      return message.content
    }
  }
  return ''
}

function buildMockResponse(userPrompt: string, model: string): string {
  if (!userPrompt.trim()) {
    return `[mock:${model}] Ready. Please send a prompt.`
  }
  return `[mock:${model}] ${userPrompt}`
}

function tokenizeForStreaming(text: string): string[] {
  const rawTokens = text.split(' ')
  const chunks: string[] = []

  for (let i = 0; i < rawTokens.length; i += 1) {
    const token = rawTokens[i]
    if (token === undefined) {
      continue
    }
    const isLast = i === rawTokens.length - 1
    chunks.push(isLast ? token : `${token} `)
  }

  return chunks
}
