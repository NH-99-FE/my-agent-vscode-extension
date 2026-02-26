import type { ExtensionToWebviewMessage, ChatDoneMessage } from '@agent/types'
import {
  resolveStreamGate,
  resolveStreamSequenceGate,
  STREAM_PROTOCOL_GAP_ERROR,
  STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR,
  STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR,
  STREAM_PROTOCOL_REQUEST_ID_MISMATCH_ERROR,
  STREAM_PROTOCOL_TURN_MISMATCH_ERROR,
  STREAM_PROTOCOL_TURN_MISSING_ERROR,
} from './streamRequestGuard'
import type { StreamDeltaBuffer } from './streamDeltaBuffer'
import type { TurnBindResult } from '../store/threadSessionStore'

type ThreadSessionMessageActions = {
  bindAssistantTurnId: (requestId: string, turnId: string) => TurnBindResult
  getTurnMessageId: (requestId: string) => string | undefined
  appendAssistantDeltaByMessageId: (messageId: string, textDelta: string) => void
  completeAssistantMessageByRequest: (requestId: string, finishReason: ChatDoneMessage['payload']['finishReason']) => void
  setAssistantErrorByRequest: (requestId: string, errorMessage: string) => void
  isActiveAssistantRequest: (sessionId: string, requestId?: string) => boolean
  setSessionProtocolError: (sessionId: string, message: string) => void
  setSessionProtocolErrorByRequest: (requestId: string, message: string) => void
}

export type StreamMessageOutcome =
  | 'not_stream'
  | 'ignore'
  | 'matched'
  | 'missing_with_active'
  | 'gap'
  | 'invalid_seq'
  | 'turn_missing'
  | 'turn_mismatch'
  | 'request_mismatch'

function flushTurnMessage(requestId: string, actions: ThreadSessionMessageActions): void {
  const messageId = actions.getTurnMessageId(requestId)
  if (!messageId) {
    return
  }
  activeStreamDeltaBuffer?.flushMessage(messageId)
}

function resolveRequestId(message: Extract<ExtensionToWebviewMessage, { type: 'chat.delta' | 'chat.done' | 'chat.error' }>): {
  requestId: string
  sessionId: string
} | null {
  const topLevelRequestId = message.requestId
  const payloadRequestId = message.payload.requestId
  if (topLevelRequestId !== payloadRequestId) {
    return null
  }
  return {
    requestId: topLevelRequestId,
    sessionId: message.payload.sessionId,
  }
}

function ensureTurnBinding(
  requestId: string,
  turnId: string,
  sessionId: string,
  actions: ThreadSessionMessageActions
): StreamMessageOutcome | null {
  const bindResult = actions.bindAssistantTurnId(requestId, turnId)
  if (bindResult === 'matched' || bindResult === 'bound') {
    return null
  }
  if (bindResult === 'missing') {
    actions.setSessionProtocolErrorByRequest(requestId, STREAM_PROTOCOL_TURN_MISSING_ERROR)
    actions.setSessionProtocolError(sessionId, STREAM_PROTOCOL_TURN_MISSING_ERROR)
    return 'turn_missing'
  }
  actions.setSessionProtocolErrorByRequest(requestId, STREAM_PROTOCOL_TURN_MISMATCH_ERROR)
  actions.setSessionProtocolError(sessionId, STREAM_PROTOCOL_TURN_MISMATCH_ERROR)
  return 'turn_mismatch'
}

export function handleThreadSessionMessage(message: ExtensionToWebviewMessage, actions: ThreadSessionMessageActions): StreamMessageOutcome {
  switch (message.type) {
    case 'chat.delta': {
      const resolved = resolveRequestId(message)
      if (!resolved) {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_REQUEST_ID_MISMATCH_ERROR)
        return 'request_mismatch'
      }

      const gate = resolveStreamGate(resolved.sessionId, resolved.requestId, actions)
      if (gate === 'ignore') {
        return 'ignore'
      }
      if (gate === 'missing_with_active') {
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR)
        return 'missing_with_active'
      }

      const turnOutcome = ensureTurnBinding(resolved.requestId, message.payload.turnId, resolved.sessionId, actions)
      if (turnOutcome) {
        flushTurnMessage(resolved.requestId, actions)
        return turnOutcome
      }

      const seqGate = resolveStreamSequenceGate(resolved.requestId, message.payload.seq, 'chat.delta')
      if (seqGate === 'ignore') {
        return 'ignore'
      }
      if (seqGate === 'gap') {
        flushTurnMessage(resolved.requestId, actions)
        actions.setSessionProtocolErrorByRequest(resolved.requestId, STREAM_PROTOCOL_GAP_ERROR)
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_GAP_ERROR)
        return 'gap'
      }
      if (seqGate === 'invalid_seq') {
        flushTurnMessage(resolved.requestId, actions)
        actions.setSessionProtocolErrorByRequest(resolved.requestId, STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR)
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR)
        return 'invalid_seq'
      }

      const messageId = actions.getTurnMessageId(resolved.requestId)
      if (!messageId) {
        actions.setSessionProtocolErrorByRequest(resolved.requestId, STREAM_PROTOCOL_TURN_MISSING_ERROR)
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_TURN_MISSING_ERROR)
        return 'turn_missing'
      }

      if (activeStreamDeltaBuffer) {
        activeStreamDeltaBuffer.enqueue(messageId, message.payload.textDelta)
      } else {
        actions.appendAssistantDeltaByMessageId(messageId, message.payload.textDelta)
      }
      return 'matched'
    }
    case 'chat.done': {
      const resolved = resolveRequestId(message)
      if (!resolved) {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_REQUEST_ID_MISMATCH_ERROR)
        return 'request_mismatch'
      }

      const gate = resolveStreamGate(resolved.sessionId, resolved.requestId, actions)
      if (gate === 'ignore') {
        return 'ignore'
      }
      if (gate === 'missing_with_active') {
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR)
        return 'missing_with_active'
      }

      const turnOutcome = ensureTurnBinding(resolved.requestId, message.payload.turnId, resolved.sessionId, actions)
      if (turnOutcome) {
        flushTurnMessage(resolved.requestId, actions)
        return turnOutcome
      }

      const seqGate = resolveStreamSequenceGate(resolved.requestId, message.payload.seq, 'chat.done')
      flushTurnMessage(resolved.requestId, actions)
      if (seqGate === 'ignore') {
        return 'ignore'
      }
      if (seqGate === 'gap') {
        actions.setSessionProtocolErrorByRequest(resolved.requestId, STREAM_PROTOCOL_GAP_ERROR)
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_GAP_ERROR)
        return 'gap'
      }
      if (seqGate === 'invalid_seq') {
        actions.setSessionProtocolErrorByRequest(resolved.requestId, STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR)
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR)
        return 'invalid_seq'
      }

      actions.completeAssistantMessageByRequest(resolved.requestId, message.payload.finishReason)
      return 'matched'
    }
    case 'chat.error': {
      const resolved = resolveRequestId(message)
      if (!resolved) {
        actions.setSessionProtocolError(message.payload.sessionId, STREAM_PROTOCOL_REQUEST_ID_MISMATCH_ERROR)
        return 'request_mismatch'
      }

      const gate = resolveStreamGate(resolved.sessionId, resolved.requestId, actions)
      if (gate === 'ignore') {
        return 'ignore'
      }
      if (gate === 'missing_with_active') {
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR)
        return 'missing_with_active'
      }

      const turnOutcome = ensureTurnBinding(resolved.requestId, message.payload.turnId, resolved.sessionId, actions)
      if (turnOutcome) {
        flushTurnMessage(resolved.requestId, actions)
        return turnOutcome
      }

      const seqGate = resolveStreamSequenceGate(resolved.requestId, message.payload.seq, 'chat.error')
      flushTurnMessage(resolved.requestId, actions)
      if (seqGate === 'ignore') {
        return 'ignore'
      }
      if (seqGate === 'gap') {
        actions.setSessionProtocolErrorByRequest(resolved.requestId, STREAM_PROTOCOL_GAP_ERROR)
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_GAP_ERROR)
        return 'gap'
      }
      if (seqGate === 'invalid_seq') {
        actions.setSessionProtocolErrorByRequest(resolved.requestId, STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR)
        actions.setSessionProtocolError(resolved.sessionId, STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR)
        return 'invalid_seq'
      }

      actions.setAssistantErrorByRequest(resolved.requestId, message.payload.message)
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
