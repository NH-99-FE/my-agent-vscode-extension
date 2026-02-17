import type { ChatAttachment, ExtensionToWebviewMessage, WebviewToExtensionMessage, ReasoningLevel } from '@agent/types'
import { CONTEXT_FILES_LIMIT_NOTICE, MAX_CONTEXT_FILES } from '../store/threadComposerStore'

export type SendChatInput = {
  /** 请求关联的会话 ID。 */
  sessionId: string
  /** 用户输入文本。 */
  text: string
  /** 目标模型 ID。 */
  model: string
  /** 推理强度等级。 */
  reasoningLevel: ReasoningLevel
  /** 本次请求附带的上下文附件。 */
  attachments: ChatAttachment[]
}

export type ThreadMessageActions = {
  /** 合并附件选择结果。 */
  addPickedFiles: (files: ChatAttachment[], targetSessionId?: string) => void
  /** 消费文件选择请求关联，返回目标会话。 */
  consumePendingContextPickSession: (requestId?: string) => string | undefined
  /** 清空附件（仅成功完成时调用）。 */
  clearAttachments: (targetSessionId?: string) => void
  /** 更新发送态。 */
  setSending: (targetSessionId: string, isSending: boolean) => void
  /** 更新内联提示。 */
  setInlineNotice: (message: string | null, targetSessionId?: string) => void
}

/** 统一组装 `chat.send`，确保 payload 与协议严格对齐。 */
export function buildChatSendMessage(input: SendChatInput): WebviewToExtensionMessage {
  return {
    type: 'chat.send',
    payload: {
      sessionId: input.sessionId,
      text: input.text,
      model: input.model,
      reasoningLevel: input.reasoningLevel,
      attachments: input.attachments,
    },
  }
}

/** 统一组装 `context.files.pick` 请求消息，并携带 requestId 用于回包关联。 */
export function buildContextFilesPickMessage(maxCount: number, requestId: string): WebviewToExtensionMessage {
  return {
    type: 'context.files.pick',
    requestId,
    payload: {
      maxCount,
    },
  }
}

/**
 * 处理扩展侧回包并下发到 store actions。
 * - `chat.done(stop|length)`：清空附件
 * - `chat.error` / `chat.done(cancelled|error)`：保留附件
 * - 发送态按 sessionId 维护，不依赖当前激活会话，避免切会话后 sending 悬挂
 */
export function handleThreadExtensionMessage(message: ExtensionToWebviewMessage, actions: ThreadMessageActions): void {
  switch (message.type) {
    case 'context.files.picked': {
      const targetSessionId = actions.consumePendingContextPickSession(message.requestId)
      actions.addPickedFiles(message.payload.files, targetSessionId)
      return
    }
    case 'chat.done': {
      actions.setSending(message.payload.sessionId, false)
      if (message.payload.finishReason === 'stop' || message.payload.finishReason === 'length') {
        actions.clearAttachments(message.payload.sessionId)
      }
      return
    }
    case 'chat.error': {
      actions.setSending(message.payload.sessionId, false)
      actions.setInlineNotice(message.payload.message, message.payload.sessionId)
      return
    }
    default: {
      return
    }
  }
}

/** 返回还能继续添加的附件数量（不会小于 0）。 */
export function getContextFilesRemaining(currentCount: number): number {
  return Math.max(MAX_CONTEXT_FILES - currentCount, 0)
}

/** 统一读取附件超限提示文案。 */
export function getContextFilesLimitNotice(): string {
  return CONTEXT_FILES_LIMIT_NOTICE
}
