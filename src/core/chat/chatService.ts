import type { ChatAttachment, ContextSnippet, ReasoningLevel } from '@agent/types'
import type { LlmCancellationSignal, LlmClient, LlmStreamEvent } from '../llm/client'
import { LlmAbortError, LlmTimeoutError } from '../llm/client'
import type { AttachmentSnippet, SkippedAttachment } from '../context/attachmentContext'
import { buildAttachmentContext } from '../context/attachmentContext'
import { buildContextFromActiveEditor } from '../context/contextBuilder'
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
    private readonly options: ChatServiceOptions = {}
  ) {}

  async *streamChat(request: ChatServiceRequest, signal?: LlmCancellationSignal): AsyncGenerator<LlmStreamEvent> {
    await this.sessionStore.appendUserMessage(request.sessionId, request.text)

    const editorContext = buildContextFromActiveEditor()
    const attachmentContext = await buildAttachmentContext(request.attachments)
    const promptWithContext = composePromptWithContext(
      request.text,
      editorContext.snippets,
      attachmentContext.snippets,
      attachmentContext.skipped
    )

    try {
      const stream = this.llmClient.streamChat({
        provider: 'mock',
        model: request.model,
        reasoningLevel: request.reasoningLevel,
        sessionId: request.sessionId,
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

      const errorMessage = error instanceof Error ? error.message : 'Unknown chat error.'
      await this.sessionStore.appendAssistantError(request.sessionId, errorMessage)

      if (error instanceof LlmTimeoutError) {
        throw error
      }

      throw error instanceof Error ? error : new Error(errorMessage)
    }
  }
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
