import type { ExtensionToWebviewMessage, ChatDoneMessage } from '@agent/types'

export type ThreadSessionMessageActions = {
  appendAssistantDelta: (sessionId: string, textDelta: string) => void
  completeAssistantMessage: (sessionId: string, finishReason: ChatDoneMessage['payload']['finishReason']) => void
  setAssistantError: (sessionId: string, errorMessage: string) => void
}

/**
 * 将扩展回包映射为会话消息状态更新：
 * - chat.delta -> 助手消息增量拼接
 * - chat.done -> 助手消息收尾
 * - chat.error -> 助手消息错误态
 */
export function handleThreadSessionMessage(message: ExtensionToWebviewMessage, actions: ThreadSessionMessageActions): void {
  switch (message.type) {
    case 'chat.delta': {
      actions.appendAssistantDelta(message.payload.sessionId, message.payload.textDelta)
      return
    }
    case 'chat.done': {
      actions.completeAssistantMessage(message.payload.sessionId, message.payload.finishReason)
      return
    }
    case 'chat.error': {
      actions.setAssistantError(message.payload.sessionId, message.payload.message)
      return
    }
    default: {
      return
    }
  }
}
