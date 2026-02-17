import type { ChatAttachment, ContextSnippet, ReasoningLevel } from '@agent/types'
import * as vscode from 'vscode'
import type { LlmCancellationSignal, LlmClient, LlmStreamEvent } from '../llm/client'
import { LlmAbortError, LlmProviderError, LlmTimeoutError, type LlmProvider } from '../llm/client'
import type { AttachmentSnippet, SkippedAttachment } from '../context/attachmentContext'
import { buildAttachmentContext } from '../context/attachmentContext'
import { buildContextFromActiveEditor } from '../context/contextBuilder'
import { createUnknownProviderError, formatLlmProviderError } from '../llm/errors'
import { getOpenAIApiKey } from '../storage/secrets'
import { SessionStore } from '../storage/sessionStore'

export interface ChatServiceRequest {
  sessionId: string
  text: string
  model: string
  reasoningLevel: ReasoningLevel
  attachments: ChatAttachment[]
}

interface ChatServiceOptions {
  timeoutMs?: number
  maxRetries?: number
  retryDelayMs?: number
}

export class ChatService {
  constructor(
    private readonly llmClient: LlmClient,
    private readonly sessionStore: SessionStore,
    private readonly context: vscode.ExtensionContext,
    private readonly options: ChatServiceOptions = {}
  ) {}

  async *streamChat(request: ChatServiceRequest, signal?: LlmCancellationSignal): AsyncGenerator<LlmStreamEvent> {
    // 先写入用户消息，保证会话时间线与真实请求顺序一致。
    await this.sessionStore.appendUserMessage(request.sessionId, request.text)

    const editorContext = buildContextFromActiveEditor()
    const attachmentContext = await buildAttachmentContext(request.attachments)
    const promptWithContext = composePromptWithContext(
      request.text,
      editorContext.snippets,
      attachmentContext.snippets,
      attachmentContext.skipped
    )
    let provider: LlmProvider = 'mock'

    try {
      // provider 选择属于业务策略，固定收敛在 service，避免泄漏到 handler。
      provider = await resolveProviderForModel(request.model)
      const stream = this.llmClient.streamChat({
        provider,
        model: request.model,
        reasoningLevel: request.reasoningLevel,
        sessionId: request.sessionId,
        ...(provider === 'openai' ? { apiKey: await requireOpenAiApiKey(this.context) } : {}),
        messages: [{ role: 'user', content: promptWithContext }],
        timeoutMs: this.options.timeoutMs ?? 30_000,
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
            break
        }
        yield event
      }
    } catch (error) {
      if (error instanceof LlmAbortError) {
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
}

async function resolveProviderForModel(model: string): Promise<LlmProvider> {
  const configuredProvider = getConfiguredProvider()
  if (configuredProvider === 'auto') {
    // auto 模式下按模型前缀映射，保证前端无 provider 字段也可路由。
    return inferProviderByModel(model)
  }
  return configuredProvider
}

function getConfiguredProvider(): LlmProvider | 'auto' {
  const configured = vscode.workspace.getConfiguration('agent').get<string>('provider.default', 'auto')
  if (configured === 'auto' || configured === 'mock' || configured === 'openai') {
    return configured
  }
  throw createUnknownProviderError(configured)
}

function inferProviderByModel(model: string): LlmProvider {
  if (model.startsWith('mock-')) {
    return 'mock'
  }
  if (model.startsWith('gpt-')) {
    return 'openai'
  }
  throw new LlmProviderError({
    code: 'unknown_model',
    provider: 'auto',
    retryable: false,
    message: `Cannot resolve provider for model "${model}".`,
  })
}

async function requireOpenAiApiKey(context: vscode.ExtensionContext): Promise<string> {
  const apiKey = await getOpenAIApiKey(context)
  if (apiKey) {
    return apiKey
  }
  // 未配置密钥时明确失败，不做静默回退，避免掩盖环境问题。
  throw new LlmProviderError({
    code: 'auth_failed',
    provider: 'openai',
    retryable: false,
    message: 'OpenAI API key is not configured.',
  })
}

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
