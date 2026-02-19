import type { ChatAttachment, ChatMessage, ContextSnippet, ReasoningLevel } from '@agent/types'
import * as vscode from 'vscode'
import type { LlmCancellationSignal, LlmChatMessage, LlmClient, LlmStreamEvent } from '../llm/client'
import { LlmAbortError, LlmProviderError, LlmTimeoutError, type LlmProvider } from '../llm/client'
import type { AttachmentSnippet, SkippedAttachment } from '../context/attachmentContext'
import { buildAttachmentContext } from '../context/attachmentContext'
import { buildContextFromActiveEditor } from '../context/contextBuilder'
import { createUnknownProviderError, formatLlmProviderError } from '../llm/errors'
import { getOpenAIApiKey, hasOpenAIApiKey } from '../storage/secrets'
import { SessionStore } from '../storage/sessionStore'

// 聊天服务请求参数
export interface ChatServiceRequest {
  requestId: string // 当前请求 ID（用于取消语义精确关联）
  sessionId: string // 会话 ID
  text: string // 用户输入文本
  model: string // 目标模型
  reasoningLevel: ReasoningLevel // 推理强度
  attachments: ChatAttachment[] // 附件列表
}

// 聊天服务配置选项
interface ChatServiceOptions {
  idleTimeoutMs?: number // 空闲超时（毫秒）
  hardTimeoutMs?: number // 硬超时（毫秒）
  timeoutMs?: number // 兼容字段：映射为 hardTimeoutMs
  maxRetries?: number // 最大重试次数
  retryDelayMs?: number // 重试延迟（毫秒）
}

const DEFAULT_IDLE_TIMEOUT_MS = 60_000
const DEFAULT_HARD_TIMEOUT_MS = 15 * 60_000

/**
 * 聊天服务类
 * 负责处理聊天请求的核心业务逻辑
 */
export class ChatService {
  /**
   * 构造函数
   * @param llmClient LLM 客户端
   * @param sessionStore 会话存储
   * @param context VS Code 扩展上下文
   * @param options 服务配置选项
   */
  constructor(
    private readonly llmClient: LlmClient,
    private readonly sessionStore: SessionStore,
    private readonly context: vscode.ExtensionContext,
    private readonly options: ChatServiceOptions = {}
  ) {}

  /**
   * 流式聊天处理
   * @param request 聊天请求参数
   * @param signal 取消信号
   * @returns 流式事件生成器
   */
  async *streamChat(request: ChatServiceRequest, signal?: LlmCancellationSignal): AsyncGenerator<LlmStreamEvent> {
    // 先写入用户消息，保证会话时间线与真实请求顺序一致
    await this.sessionStore.appendUserMessage(request.sessionId, request.text, request.requestId)

    const editorContext = buildContextFromActiveEditor()
    const attachmentContext = await buildAttachmentContext(request.attachments)
    const promptWithContext = composePromptWithContext(
      request.text,
      editorContext.snippets,
      attachmentContext.snippets,
      attachmentContext.skipped
    )
    const llmMessages = await buildLlmMessagesForCurrentTurn(this.sessionStore, request.sessionId, request.text, promptWithContext)
    let provider: LlmProvider = 'mock'

    try {
      // provider 选择属于业务策略，固定收敛在 service，避免泄漏到 handler
      provider = await resolveProviderForModel(this.context, request.model)
      const openAiRequestOptions = provider === 'openai' ? await buildOpenAiRequestOptions(this.context) : undefined
      const stream = this.llmClient.streamChat({
        provider,
        model: request.model,
        reasoningLevel: request.reasoningLevel,
        sessionId: request.sessionId,
        ...(openAiRequestOptions ?? {}),
        messages: llmMessages,
        idleTimeoutMs: this.options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
        hardTimeoutMs: this.options.hardTimeoutMs ?? this.options.timeoutMs ?? DEFAULT_HARD_TIMEOUT_MS,
        maxRetries: this.options.maxRetries ?? 1,
        retryDelayMs: this.options.retryDelayMs ?? 200,
        ...(signal ? { signal } : {}),
      })

      for await (const event of stream) {
        switch (event.type) {
          case 'text-delta':
            await this.sessionStore.appendAssistantDelta(request.sessionId, event.delta)
            break
          case 'error':
            await this.sessionStore.appendAssistantError(request.sessionId, event.message)
            break
          case 'done':
            await this.sessionStore.setLastAssistantFinishReason(request.sessionId, event.finishReason)
            break
        }
        yield event
      }
    } catch (error) {
      if (error instanceof LlmAbortError) {
        await this.markUserTurnCancelled(request.sessionId, request.requestId)
        await this.sessionStore.setLastAssistantFinishReason(request.sessionId, 'cancelled')
        throw error
      }

      if (error instanceof LlmProviderError) {
        // 统一格式化 provider 错误，前端可直接按固定模板提示。
        const formatted = formatLlmProviderError(error)
        await this.sessionStore.appendAssistantError(request.sessionId, formatted)
        throw new Error(formatted)
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown chat error.'
      await this.sessionStore.appendAssistantError(request.sessionId, errorMessage)

      if (error instanceof LlmTimeoutError) {
        throw error
      }

      throw error instanceof Error ? error : new Error(errorMessage)
    }
  }

  async markUserTurnCancelled(sessionId: string, requestId: string): Promise<void> {
    await this.sessionStore.markUserMessageCancelled(sessionId, requestId)
  }
}

async function resolveProviderForModel(context: vscode.ExtensionContext, model: string): Promise<LlmProvider> {
  const normalizedModel = model.trim()
  if (!normalizedModel) {
    throw new LlmProviderError({
      code: 'unknown_model',
      provider: 'auto',
      retryable: false,
      message: 'Model name is required.',
    })
  }

  const configuredProvider = getConfiguredProvider()
  if (configuredProvider === 'openai') {
    // openai 模式允许任意 OpenAI-compatible 模型名透传。
    return 'openai'
  }
  if (configuredProvider === 'mock') {
    return inferMockProvider(normalizedModel)
  }
  // auto 规则：优先保留 mock-* 测试通道；否则在存在 OpenAI key 时走 openai 兼容链路。
  return inferAutoProvider(context, normalizedModel)
}

function getConfiguredProvider(): LlmProvider | 'auto' {
  const configured = vscode.workspace.getConfiguration('agent').get<string>('provider.default', 'auto')
  if (configured === 'auto' || configured === 'mock' || configured === 'openai') {
    return configured
  }
  throw createUnknownProviderError(configured)
}

/**
 * 推断 mock provider
 * @param model 模型名称
 * @returns LLM 提供方
 * @throws LlmProviderError 当模型不支持时
 */
function inferMockProvider(model: string): LlmProvider {
  if (model.startsWith('mock-')) {
    return 'mock'
  }
  throw new LlmProviderError({
    code: 'unknown_model',
    provider: 'mock',
    retryable: false,
    message: `Model "${model}" is not supported in mock mode.`,
  })
}

/**
 * 推断自动 provider
 * @param context VS Code 扩展上下文
 * @param model 模型名称
 * @returns LLM 提供方
 * @throws LlmProviderError 当无法解析 provider 时
 */
async function inferAutoProvider(context: vscode.ExtensionContext, model: string): Promise<LlmProvider> {
  if (model.startsWith('mock-')) {
    return 'mock'
  }

  if (await hasOpenAIApiKey(context)) {
    return 'openai'
  }

  throw new LlmProviderError({
    code: 'unknown_model',
    provider: 'auto',
    retryable: false,
    message: `Cannot resolve provider for model "${model}" in auto mode. Configure OpenAI API key or switch provider.default.`,
  })
}

/**
 * 构建 OpenAI 请求选项
 * @param context VS Code 扩展上下文
 * @returns OpenAI 请求选项
 * @throws LlmProviderError 当 API Key 未配置时
 */
async function buildOpenAiRequestOptions(context: vscode.ExtensionContext): Promise<{ apiKey: string; baseUrl?: string }> {
  const baseUrl = getOpenAiBaseUrlFromConfig()
  const apiKey = await getOpenAIApiKey(context)
  if (!apiKey) {
    // 未配置密钥时明确失败，不做静默回退，避免掩盖环境问题
    throw new LlmProviderError({
      code: 'auth_failed',
      provider: 'openai',
      retryable: false,
      message: 'OpenAI API key is not configured.',
    })
  }

  return {
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
  }
}

/**
 * 从配置中获取 OpenAI 基础 URL
 * @returns OpenAI 基础 URL
 */
function getOpenAiBaseUrlFromConfig(): string {
  const configured = vscode.workspace.getConfiguration('agent').get<string>('openai.baseUrl', '')
  return typeof configured === 'string' ? configured.trim() : ''
}

/**
 * 组合带上下文的提示词
 * @param userText 用户输入文本
 * @param editorSnippets 编辑器上下文片段
 * @param attachmentSnippets 附件上下文片段
 * @param skippedAttachments 跳过的附件
 * @returns 组合后的提示词
 */
function composePromptWithContext(
  userText: string,
  editorSnippets: ContextSnippet[],
  attachmentSnippets: AttachmentSnippet[],
  skippedAttachments: SkippedAttachment[]
): string {
  if (editorSnippets.length === 0 && attachmentSnippets.length === 0 && skippedAttachments.length === 0) {
    return userText
  }

  const sections: string[] = [`User request:\n${userText}`]

  if (editorSnippets.length > 0) {
    const editorBlock = editorSnippets
      .map((snippet, index) => {
        return [
          `### Editor Context ${index + 1}`,
          `source: ${snippet.source}`,
          `file: ${snippet.filePath}`,
          '```',
          snippet.content,
          '```',
        ].join('\n')
      })
      .join('\n\n')
    sections.push(`Editor context:\n${editorBlock}`)
  }

  if (attachmentSnippets.length > 0) {
    const attachmentBlock = attachmentSnippets
      .map((snippet, index) => {
        return [`### Attachment ${index + 1}`, `name: ${snippet.name}`, `path: ${snippet.path}`, '```', snippet.content, '```'].join('\n')
      })
      .join('\n\n')
    sections.push(`Attachment context:\n${attachmentBlock}`)
  }

  if (skippedAttachments.length > 0) {
    const skippedBlock = skippedAttachments.map(item => `- ${item.name} (${item.path}): ${item.reason}`).join('\n')
    sections.push(`Skipped attachments:\n${skippedBlock}`)
  }

  return sections.join('\n\n')
}

/**
 * 为当前轮次构建 LLM 消息
 * @param sessionStore 会话存储
 * @param sessionId 会话 ID
 * @param currentUserText 当前用户文本
 * @param currentPromptWithContext 当前带上下文的提示词
 * @returns LLM 消息数组
 */
async function buildLlmMessagesForCurrentTurn(
  sessionStore: SessionStore,
  sessionId: string,
  currentUserText: string,
  currentPromptWithContext: string
): Promise<LlmChatMessage[]> {
  try {
    const session = await sessionStore.getSessionById(sessionId)
    if (!session || session.messages.length === 0) {
      return [{ role: 'user', content: currentPromptWithContext }]
    }

    const historyMessages = session.messages.filter(shouldIncludeInContext).map<LlmChatMessage>(message => ({
      role: message.role,
      content: message.content,
    }))

    // appendUserMessage 已在本轮开始时写入 currentUserText，这里移除末尾那条原文防重复
    const lastHistoryMessage = historyMessages[historyMessages.length - 1]
    if (lastHistoryMessage?.role === 'user' && lastHistoryMessage.content === currentUserText) {
      historyMessages.pop()
    }

    return [
      ...historyMessages,
      {
        role: 'user',
        content: currentPromptWithContext,
      },
    ]
  } catch {
    // 历史读取异常时降级为单轮模式，保证主链路可用
    return [{ role: 'user', content: currentPromptWithContext }]
  }
}

function shouldIncludeInContext(message: ChatMessage): message is ChatMessage & { role: 'user' | 'assistant' } {
  if (message.role === 'user') {
    if (message.state === 'cancelled') {
      return false
    }
    return true
  }

  if (message.role !== 'assistant') {
    return false
  }

  if (message.finishReason === 'stop' || message.finishReason === 'length') {
    return true
  }

  if (message.finishReason === 'cancelled' || message.finishReason === 'error') {
    return false
  }

  // 旧数据或异常数据缺失 finishReason 时，保守不注入上下文。
  return false
}
