import type { ChatAttachment, ExtensionToWebviewMessage, ReasoningLevel, WebviewToExtensionMessage } from '@agent/types'
import { CONTEXT_FILES_LIMIT_NOTICE, MAX_CONTEXT_FILES } from '../store/threadComposerStore'
import {
  clearStreamRequest,
  STREAM_PROTOCOL_GAP_ERROR,
  STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR,
  STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR,
  STREAM_PROTOCOL_REQUEST_ID_MISMATCH_ERROR,
  STREAM_PROTOCOL_TURN_MISMATCH_ERROR,
  STREAM_PROTOCOL_TURN_MISSING_ERROR,
} from './streamRequestGuard'
import type { StreamMessageOutcome } from './threadSessionService'

type SendChatInput = {
  requestId: string
  sessionId: string
  text: string
  model: string
  reasoningLevel: ReasoningLevel
  attachments: ChatAttachment[]
  includeActiveEditorContext: boolean
}

type ThreadMessageActions = {
  addPickedFiles: (files: ChatAttachment[], targetSessionId?: string) => void
  consumePendingContextPickSession: (requestId?: string) => string | undefined
  clearAttachments: (targetSessionId?: string) => void
  setSending: (targetSessionId: string, isSending: boolean) => void
  setInlineNotice: (message: string | null, targetSessionId?: string) => void
  endAssistantRequest: (sessionId: string, requestId: string) => void
}

export function buildChatSendMessage(input: SendChatInput): WebviewToExtensionMessage {
  return {
    type: 'chat.send',
    requestId: input.requestId,
    payload: {
      sessionId: input.sessionId,
      text: input.text,
      model: input.model,
      reasoningLevel: input.reasoningLevel,
      attachments: input.attachments,
      includeActiveEditorContext: input.includeActiveEditorContext,
    },
  }
}

export function buildChatCancelMessage(sessionId: string, requestId?: string): WebviewToExtensionMessage {
  return {
    type: 'chat.cancel',
    ...(requestId !== undefined ? { requestId } : {}),
    payload: {
      sessionId,
    },
  }
}

export function buildContextFilesPickMessage(maxCount: number, requestId: string): WebviewToExtensionMessage {
  return {
    type: 'context.files.pick',
    requestId,
    payload: {
      maxCount,
    },
  }
}

function resolveStreamProtocolNotice(outcome: StreamMessageOutcome): string | undefined {
  switch (outcome) {
    case 'missing_with_active':
      return STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR
    case 'gap':
      return STREAM_PROTOCOL_GAP_ERROR
    case 'invalid_seq':
      return STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR
    case 'turn_missing':
      return STREAM_PROTOCOL_TURN_MISSING_ERROR
    case 'turn_mismatch':
      return STREAM_PROTOCOL_TURN_MISMATCH_ERROR
    case 'request_mismatch':
      return STREAM_PROTOCOL_REQUEST_ID_MISMATCH_ERROR
    default:
      return undefined
  }
}

function shouldTerminateStream(outcome: StreamMessageOutcome): boolean {
  return (
    outcome === 'missing_with_active' ||
    outcome === 'gap' ||
    outcome === 'invalid_seq' ||
    outcome === 'turn_missing' ||
    outcome === 'turn_mismatch' ||
    outcome === 'request_mismatch'
  )
}

function closeRequestLifecycle(sessionId: string, requestId: string, actions: ThreadMessageActions): void {
  if (requestId.trim().length === 0) {
    return
  }
  actions.endAssistantRequest(sessionId, requestId)
  clearStreamRequest(requestId)
}

export function handleThreadExtensionMessage(
  message: ExtensionToWebviewMessage,
  actions: ThreadMessageActions,
  streamOutcome: StreamMessageOutcome
): void {
  switch (message.type) {
    case 'context.files.picked': {
      const targetSessionId = actions.consumePendingContextPickSession(message.requestId)
      actions.addPickedFiles(message.payload.files, targetSessionId)
      return
    }
    case 'chat.delta': {
      if (!shouldTerminateStream(streamOutcome)) {
        return
      }
      const protocolNotice = resolveStreamProtocolNotice(streamOutcome)
      if (protocolNotice) {
        actions.setInlineNotice(protocolNotice, message.payload.sessionId)
      }
      actions.setSending(message.payload.sessionId, false)
      closeRequestLifecycle(message.payload.sessionId, message.payload.requestId, actions)
      return
    }
    case 'chat.done': {
      if (streamOutcome === 'ignore') {
        clearStreamRequest(message.payload.requestId)
        return
      }
      if (shouldTerminateStream(streamOutcome)) {
        const protocolNotice = resolveStreamProtocolNotice(streamOutcome)
        if (protocolNotice) {
          actions.setInlineNotice(protocolNotice, message.payload.sessionId)
        }
        actions.setSending(message.payload.sessionId, false)
        closeRequestLifecycle(message.payload.sessionId, message.payload.requestId, actions)
        return
      }

      actions.setSending(message.payload.sessionId, false)
      if (message.payload.finishReason === 'stop' || message.payload.finishReason === 'length') {
        actions.clearAttachments(message.payload.sessionId)
      }
      closeRequestLifecycle(message.payload.sessionId, message.payload.requestId, actions)
      return
    }
    case 'chat.error': {
      if (streamOutcome === 'ignore') {
        clearStreamRequest(message.payload.requestId)
        return
      }
      if (shouldTerminateStream(streamOutcome)) {
        const protocolNotice = resolveStreamProtocolNotice(streamOutcome)
        if (protocolNotice) {
          actions.setInlineNotice(protocolNotice, message.payload.sessionId)
        }
        actions.setSending(message.payload.sessionId, false)
        closeRequestLifecycle(message.payload.sessionId, message.payload.requestId, actions)
        return
      }

      actions.setSending(message.payload.sessionId, false)
      actions.setInlineNotice(message.payload.message, message.payload.sessionId)
      closeRequestLifecycle(message.payload.sessionId, message.payload.requestId, actions)
      return
    }
    default: {
      return
    }
  }
}

export function getContextFilesRemaining(currentCount: number): number {
  return Math.max(MAX_CONTEXT_FILES - currentCount, 0)
}

export function getContextFilesLimitNotice(): string {
  return CONTEXT_FILES_LIMIT_NOTICE
}
