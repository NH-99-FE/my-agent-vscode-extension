import type { ExtensionToWebviewMessage, ChatDoneMessage } from '@agent/types'
import {
  resolveStreamGate,
  resolveStreamSequenceGate,
  STREAM_PROTOCOL_GAP_ERROR,
  STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR,
} from './streamRequestGuard'
import type { StreamDeltaBuffer } from './streamDeltaBuffer'

// 线程会话消息操作接口
type ThreadSessionMessageActions = {
  appendAssistantDelta: (sessionId: string, textDelta: string) => void // 追加助手消息增量
  completeAssistantMessage: (sessionId: string, finishReason: ChatDoneMessage['payload']['finishReason']) => void // 完成助手消息
  setAssistantError: (sessionId: string, errorMessage: string) => void // 设置助手消息错误
  isActiveAssistantRequest: (sessionId: string, requestId?: string) => boolean // 判断 requestId 是否命中当前 active 请求
  setSessionProtocolError: (sessionId: string, message: string) => void // 设置协议级错误（可见）
}

export type StreamMessageOutcome = 'not_stream' | 'ignore' | 'missing_with_active' | 'gap' | 'matched'

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
export function handleThreadSessionMessage(message: ExtensionToWebviewMessage, actions: ThreadSessionMessageActions): StreamMessageOutcome {
  switch (message.type) {
    case 'chat.delta': {
      const gate = resolveStreamGate(message.payload.sessionId, message.requestId, actions)
      if (gate === 'ignore') {
        return 'ignore'
      }
      if (gate === 'missing_with_active') {
        // 先冲刷同会话已缓冲增量，避免随后协议错误收尾后又被 rAF 补写出“复活”的 streaming 消息。
        activeStreamDeltaBuffer?.flushSession(message.payload.sessionId)
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR)
        return 'missing_with_active'
      }

      const seqGate = resolveStreamSequenceGate(message.requestId, message.payload.seq, 'chat.delta')
      if (seqGate === 'ignore') {
        return 'ignore'
      }
      if (seqGate === 'gap') {
        activeStreamDeltaBuffer?.flushSession(message.payload.sessionId)
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_GAP_ERROR)
        return 'gap'
      }

      if (activeStreamDeltaBuffer) {
        activeStreamDeltaBuffer.enqueue(message.payload.sessionId, message.payload.textDelta)
      } else {
        actions.appendAssistantDelta(message.payload.sessionId, message.payload.textDelta)
      }
      return 'matched'
    }
    case 'chat.done': {
      const gate = resolveStreamGate(message.payload.sessionId, message.requestId, actions)
      if (gate === 'ignore') {
        return 'ignore'
      }
      activeStreamDeltaBuffer?.flushSession(message.payload.sessionId)
      if (gate === 'missing_with_active') {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR)
        return 'missing_with_active'
      }

      const seqGate = resolveStreamSequenceGate(message.requestId, message.payload.seq, 'chat.done')
      if (seqGate === 'ignore') {
        return 'ignore'
      }
      if (seqGate === 'gap') {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_GAP_ERROR)
        return 'gap'
      }

      actions.completeAssistantMessage(message.payload.sessionId, message.payload.finishReason)
      return 'matched'
    }
    case 'chat.error': {
      const gate = resolveStreamGate(message.payload.sessionId, message.requestId, actions)
      if (gate === 'ignore') {
        return 'ignore'
      }
      activeStreamDeltaBuffer?.flushSession(message.payload.sessionId)
      if (gate === 'missing_with_active') {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR)
        return 'missing_with_active'
      }

      const seqGate = resolveStreamSequenceGate(message.requestId, message.payload.seq, 'chat.error')
      if (seqGate === 'ignore') {
        return 'ignore'
      }
      if (seqGate === 'gap') {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_GAP_ERROR)
        return 'gap'
      }

      actions.setAssistantError(message.payload.sessionId, message.payload.message)
      return 'matched'
    }
    default: {
      return 'not_stream'
    }
  }
}

let activeStreamDeltaBuffer: StreamDeltaBuffer | null = null

export function setThreadSessionDeltaBuffer(buffer: StreamDeltaBuffer | null): void {
  activeStreamDeltaBuffer = buffer
}
