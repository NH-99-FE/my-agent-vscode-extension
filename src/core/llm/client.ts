import type { ReasoningLevel } from '@agent/types'
import {
  assertNotCancelled,
  createTimeoutController,
  mergeSignals,
  sleep,
  type LlmCancellationSignal,
  LlmCancellationController,
} from './cancellation'
import { LlmAbortError, LlmProviderError, LlmTimeoutError } from './errors'
import { createProviderRegistry } from './providers/registry'
import { MockProviderAdapter } from './providers/mockAdapter'
import { OpenAIProviderAdapter } from './providers/openaiAdapter'
import type { ProviderRegistry } from './providers/types'

// LLM 提供方枚举
export type LlmProvider = 'mock' | 'openai'

// 聊天消息输入结构（扩展侧内部使用）
export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' // 消息角色
  content: string // 消息内容
}

// 流式调用请求参数
export interface LlmStreamRequest {
  provider: LlmProvider // LLM 提供方
  model: string // 模型名称
  reasoningLevel: ReasoningLevel // 推理强度
  sessionId: string // 会话 ID
  messages: LlmChatMessage[] // 消息历史
  apiKey?: string // Provider 访问密钥（按 provider 决定是否必填）
  baseUrl?: string // OpenAI 兼容网关基础地址（可选）
  temperature?: number // 温度参数
  timeoutMs?: number // 超时时间（毫秒）
  maxRetries?: number // 最大重试次数
  retryDelayMs?: number // 重试延迟（毫秒）
  signal?: LlmCancellationSignal // 取消信号
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
 * 客户端工厂：注册 mock + openai adapter。
 */
export function createLlmClient(): LlmClient {
  const providerRegistry = createProviderRegistry({
    mockAdapter: new MockProviderAdapter(),
    openAiAdapter: new OpenAIProviderAdapter(),
  })
  return new DefaultLlmClient(providerRegistry)
}

class DefaultLlmClient implements LlmClient {
  constructor(private readonly providerRegistry: ProviderRegistry) {}

  async *streamChat(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent> {
    // registry 统一处理 provider/model 的合法性校验。
    const adapter = this.providerRegistry.getAdapter(request.provider, request.model)
    const maxRetries = request.maxRetries ?? 1
    const retryDelayMs = request.retryDelayMs ?? 250

    // 重试策略：首次 + maxRetries 次，取消/超时/不可重试错误直接中断。
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const timeoutController = createTimeoutController(request.timeoutMs)
      const mergedSignal = mergeSignals(request.signal, timeoutController.signal)

      try {
        const nextRequest: LlmStreamRequest = {
          ...request,
          ...(mergedSignal ? { signal: mergedSignal } : {}),
        }

        // 在进入 provider 前做一次前置取消检查，避免无意义出站请求。
        assertNotCancelled(nextRequest.signal)
        for await (const event of adapter.streamChat(nextRequest)) {
          yield event
        }
        return
      } catch (error) {
        // 取消、超时与不可重试 provider 错误直接上抛给 service 映射。
        if (error instanceof LlmAbortError || error instanceof LlmTimeoutError) {
          throw error
        }

        if (error instanceof LlmProviderError && !error.retryable) {
          throw error
        }

        const isLastAttempt = attempt >= maxRetries
        if (isLastAttempt) {
          throw error
        }

        await sleep(retryDelayMs, request.signal)
      } finally {
        timeoutController.cancel('dispose')
      }
    }
  }
}

export { LlmAbortError, LlmProviderError, LlmTimeoutError, type LlmCancellationSignal, LlmCancellationController }
