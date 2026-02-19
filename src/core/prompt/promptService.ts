import type { ChatMessage, ContextSnippet } from '@agent/types'
import type { AttachmentSnippet, SkippedAttachment } from '../context/attachmentContext'
import type { LlmChatMessage } from '../llm/client'
import { SessionStore } from '../storage/sessionStore'
import { getSystemPrompt } from './systemPrompt'

interface BuildLlmMessagesInput {
  sessionStore: SessionStore
  sessionId: string
  currentUserText: string
  editorSnippets: ContextSnippet[]
  attachmentSnippets: AttachmentSnippet[]
  skippedAttachments: SkippedAttachment[]
}

export async function buildLlmMessagesForCurrentTurn(input: BuildLlmMessagesInput): Promise<LlmChatMessage[]> {
  const currentPromptWithContext = composePromptWithContext(
    input.currentUserText,
    input.editorSnippets,
    input.attachmentSnippets,
    input.skippedAttachments
  )
  const systemMessage: LlmChatMessage = {
    role: 'system',
    content: getSystemPrompt(),
  }

  try {
    const session = await input.sessionStore.getSessionById(input.sessionId)
    if (!session || session.messages.length === 0) {
      return [systemMessage, { role: 'user', content: currentPromptWithContext }]
    }

    const historyMessages = session.messages.filter(shouldIncludeInContext).map<LlmChatMessage>(message => ({
      role: message.role,
      content: message.content,
    }))

    // appendUserMessage 已在本轮开始时写入 currentUserText，这里移除末尾那条原文防重复
    const lastHistoryMessage = historyMessages[historyMessages.length - 1]
    if (lastHistoryMessage?.role === 'user' && lastHistoryMessage.content === input.currentUserText) {
      historyMessages.pop()
    }

    return [
      systemMessage,
      ...historyMessages,
      {
        role: 'user',
        content: currentPromptWithContext,
      },
    ]
  } catch {
    // 历史读取异常时降级为单轮模式，保证主链路可用
    return [systemMessage, { role: 'user', content: currentPromptWithContext }]
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
