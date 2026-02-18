import type { ExtensionToWebviewMessage, ChatDoneMessage } from '@agent/types'
import { resolveStreamGate, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR } from './streamRequestGuard'

// 线程会话消息操作接口
type ThreadSessionMessageActions = {
  appendAssistantDelta: (sessionId: string, textDelta: string) => void // 追加助手消息增量
  completeAssistantMessage: (sessionId: string, finishReason: ChatDoneMessage['payload']['finishReason']) => void // 完成助手消息
  setAssistantError: (sessionId: string, errorMessage: string) => void // 设置助手消息错误
  isActiveAssistantRequest: (sessionId: string, requestId?: string) => boolean // 判断 requestId 是否命中当前 active 请求
  setSessionProtocolError: (sessionId: string, message: string) => void // 设置协议级错误（可见）
}

/**
 * 将扩展回包映射为会话消息状态更新
 * @param message 扩展发送的消息
 * @param actions 线程会话消息操作接口
 *
 * 映射关系：
 * - chat.delta -> 助手消息增量拼接
 * - chat.done -> 助手消息收尾
 * - chat.error -> 助手消息错误态
 */
export function handleThreadSessionMessage(message: ExtensionToWebviewMessage, actions: ThreadSessionMessageActions): void {
  switch (message.type) {
    case 'chat.delta': {
      const gate = resolveStreamGate(message.payload.sessionId, message.requestId, actions)
      if (gate === 'ignore') {
        return
      }
      if (gate === 'missing_with_active') {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR)
        return
      }
      actions.appendAssistantDelta(message.payload.sessionId, message.payload.textDelta)
      return
    }
    case 'chat.done': {
      const gate = resolveStreamGate(message.payload.sessionId, message.requestId, actions)
      if (gate === 'ignore') {
        return
      }
      if (gate === 'missing_with_active') {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR)
        return
      }
      actions.completeAssistantMessage(message.payload.sessionId, message.payload.finishReason)
      return
    }
    case 'chat.error': {
      const gate = resolveStreamGate(message.payload.sessionId, message.requestId, actions)
      if (gate === 'ignore') {
        return
      }
      if (gate === 'missing_with_active') {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR)
        return
      }
      actions.setAssistantError(message.payload.sessionId, message.payload.message)
      return
    }
    default: {
      return
    }
  }
}
