import { create } from 'zustand'
import type { ChatDoneMessage, ChatSession } from '@agent/types'

export type ThreadMessageRole = 'user' | 'assistant'
export type ThreadMessageStatus = 'streaming' | 'done' | 'error'
type ThreadFinishReason = ChatDoneMessage['payload']['finishReason']
type TurnStatus = 'streaming' | 'cancelling' | 'closed'

export type ThreadMessageItem = {
  id: string
  role: ThreadMessageRole
  text: string
  createdAt: number
  status: ThreadMessageStatus
  finishReason?: ThreadFinishReason
  errorMessage?: string
}

export type ThreadTurnState = {
  requestId: string
  sessionId: string
  assistantMessageId: string
  turnId?: string
  status: TurnStatus
}

export type TurnBindResult = 'matched' | 'bound' | 'missing' | 'mismatch'

type ThreadSessionState = {
  messages: ThreadMessageItem[]
  error: string | null
}

type ThreadSessionStoreState = {
  sessionsById: Record<string, ThreadSessionState>
  activeRequestIdBySession: Record<string, string | undefined>
  turnByRequestId: Record<string, ThreadTurnState | undefined>
  messageSessionIdByMessageId: Record<string, string | undefined>
}

type ThreadSessionStoreActions = {
  ensureSession: (sessionId: string) => void
  beginAssistantRequest: (sessionId: string, requestId: string) => void
  markAssistantRequestCancelling: (sessionId: string, requestId: string) => void
  bindAssistantTurnId: (requestId: string, turnId: string) => TurnBindResult
  getTurnMessageId: (requestId: string) => string | undefined
  getActiveAssistantRequestId: (sessionId: string) => string | undefined
  isActiveAssistantRequest: (sessionId: string, requestId?: string) => boolean
  endAssistantRequest: (sessionId: string, requestId: string) => void
  appendUserMessage: (sessionId: string, text: string) => void
  appendAssistantDeltaByMessageId: (messageId: string, textDeltaBatch: string) => void
  completeAssistantMessageByRequest: (requestId: string, finishReason: ThreadFinishReason) => void
  setAssistantErrorByRequest: (requestId: string, errorMessage: string) => void
  hydrateSessionFromBackend: (session: ChatSession) => void
  setSessionError: (sessionId: string, error: string | null) => void
  setSessionProtocolError: (sessionId: string, message: string) => void
  setSessionProtocolErrorByRequest: (requestId: string, message: string) => void
}

type ThreadSessionStore = ThreadSessionStoreState & { actions: ThreadSessionStoreActions }

const EMPTY_MESSAGES: ThreadMessageItem[] = []

function createInitialSessionState(): ThreadSessionState {
  return {
    messages: [],
    error: null,
  }
}

function createMessageId(): string {
  return crypto.randomUUID()
}

function isValidSessionId(sessionId: string): boolean {
  return sessionId.trim().length > 0
}

function isValidRequestId(requestId: string): boolean {
  return requestId.trim().length > 0
}

function ensureSessionRecord(sessionsById: Record<string, ThreadSessionState>, sessionId: string): Record<string, ThreadSessionState> {
  if (sessionsById[sessionId]) {
    return sessionsById
  }
  return {
    ...sessionsById,
    [sessionId]: createInitialSessionState(),
  }
}

function getSessionState(sessionsById: Record<string, ThreadSessionState>, sessionId: string): ThreadSessionState {
  return sessionsById[sessionId] ?? createInitialSessionState()
}

function createUserMessage(text: string): ThreadMessageItem {
  return {
    id: createMessageId(),
    role: 'user',
    text,
    createdAt: Date.now(),
    status: 'done',
  }
}

function createAssistantStreamingMessage(id: string, text: string): ThreadMessageItem {
  return {
    id,
    role: 'assistant',
    text,
    createdAt: Date.now(),
    status: 'streaming',
  }
}

function appendStreamingDelta(message: ThreadMessageItem, textDelta: string): ThreadMessageItem {
  return {
    ...message,
    text: `${message.text}${textDelta}`,
    status: 'streaming',
  }
}

function completeAssistantStream(message: ThreadMessageItem, finishReason: ThreadFinishReason): ThreadMessageItem {
  const nextStatus: ThreadMessageStatus = finishReason === 'error' ? 'error' : 'done'
  return {
    ...message,
    status: nextStatus,
    finishReason,
  }
}

function markAssistantStreamError(message: ThreadMessageItem, errorMessage: string): ThreadMessageItem {
  return {
    ...message,
    status: 'error',
    finishReason: 'error',
    errorMessage,
  }
}

function mapBackendRole(role: ChatSession['messages'][number]['role']): ThreadMessageRole {
  return role === 'user' ? 'user' : 'assistant'
}

function mapBackendMessagesToThreadMessages(messages: ChatSession['messages']): ThreadMessageItem[] {
  const mapped: ThreadMessageItem[] = []
  for (const message of messages) {
    const messageId = createMessageId()
    mapped.push({
      id: messageId,
      role: mapBackendRole(message.role),
      text: message.content,
      createdAt: message.timestamp,
      status: 'done',
    })
  }
  return mapped
}

function dropMessageMappingsForSession(
  messageSessionIdByMessageId: Record<string, string | undefined>,
  sessionId: string
): Record<string, string | undefined> {
  const nextMapping = { ...messageSessionIdByMessageId }
  for (const [messageId, ownerSessionId] of Object.entries(nextMapping)) {
    if (ownerSessionId === sessionId) {
      delete nextMapping[messageId]
    }
  }
  return nextMapping
}

function updateMessageById(
  state: ThreadSessionStoreState,
  messageId: string,
  updater: (message: ThreadMessageItem) => ThreadMessageItem
): {
  sessionsById: Record<string, ThreadSessionState>
  sessionId?: string
  found: boolean
} {
  const sessionId = state.messageSessionIdByMessageId[messageId]
  if (!sessionId) {
    return {
      sessionsById: state.sessionsById,
      found: false,
    }
  }

  const sessionsById = ensureSessionRecord(state.sessionsById, sessionId)
  const session = getSessionState(sessionsById, sessionId)
  let matched = false
  const nextMessages = session.messages.map(message => {
    if (message.id !== messageId) {
      return message
    }
    matched = true
    return updater(message)
  })

  if (!matched) {
    return {
      sessionsById: state.sessionsById,
      found: false,
    }
  }

  return {
    sessionsById: {
      ...sessionsById,
      [sessionId]: {
        ...session,
        messages: nextMessages,
      },
    },
    sessionId,
    found: true,
  }
}

const useThreadSessionStore = create<ThreadSessionStore>((set, get) => ({
  sessionsById: {},
  activeRequestIdBySession: {},
  turnByRequestId: {},
  messageSessionIdByMessageId: {},
  actions: {
    ensureSession: sessionId => {
      if (!isValidSessionId(sessionId)) {
        return
      }
      set(state => ({
        sessionsById: ensureSessionRecord(state.sessionsById, sessionId),
      }))
    },
    beginAssistantRequest: (sessionId, requestId) => {
      if (!isValidSessionId(sessionId) || !isValidRequestId(requestId)) {
        return
      }
      set(state => {
        const sessionsById = ensureSessionRecord(state.sessionsById, sessionId)
        const session = getSessionState(sessionsById, sessionId)
        const assistantMessageId = createMessageId()
        const previousRequestId = state.activeRequestIdBySession[sessionId]

        const nextTurnByRequestId = { ...state.turnByRequestId }
        if (previousRequestId && previousRequestId !== requestId) {
          delete nextTurnByRequestId[previousRequestId]
        }
        nextTurnByRequestId[requestId] = {
          requestId,
          sessionId,
          assistantMessageId,
          status: 'streaming',
        }

        return {
          sessionsById: {
            ...sessionsById,
            [sessionId]: {
              ...session,
              error: null,
              messages: [...session.messages, createAssistantStreamingMessage(assistantMessageId, '')],
            },
          },
          activeRequestIdBySession: {
            ...state.activeRequestIdBySession,
            [sessionId]: requestId,
          },
          turnByRequestId: nextTurnByRequestId,
          messageSessionIdByMessageId: {
            ...state.messageSessionIdByMessageId,
            [assistantMessageId]: sessionId,
          },
        }
      })
    },
    markAssistantRequestCancelling: (sessionId, requestId) => {
      if (!isValidSessionId(sessionId) || !isValidRequestId(requestId)) {
        return
      }
      set(state => {
        if (state.activeRequestIdBySession[sessionId] !== requestId) {
          return {}
        }
        const turn = state.turnByRequestId[requestId]
        if (!turn || turn.status === 'closed') {
          return {}
        }
        return {
          turnByRequestId: {
            ...state.turnByRequestId,
            [requestId]: {
              ...turn,
              status: 'cancelling',
            },
          },
        }
      })
    },
    bindAssistantTurnId: (requestId, turnId) => {
      if (!isValidRequestId(requestId) || turnId.trim().length === 0) {
        return 'missing'
      }
      const turn = get().turnByRequestId[requestId]
      if (!turn) {
        return 'missing'
      }
      if (!turn.turnId) {
        set(state => ({
          turnByRequestId: {
            ...state.turnByRequestId,
            [requestId]: {
              ...turn,
              turnId,
            },
          },
        }))
        return 'bound'
      }
      return turn.turnId === turnId ? 'matched' : 'mismatch'
    },
    getTurnMessageId: requestId => {
      if (!isValidRequestId(requestId)) {
        return undefined
      }
      return get().turnByRequestId[requestId]?.assistantMessageId
    },
    getActiveAssistantRequestId: sessionId => {
      if (!isValidSessionId(sessionId)) {
        return undefined
      }
      return get().activeRequestIdBySession[sessionId]
    },
    isActiveAssistantRequest: (sessionId, requestId) => {
      if (!isValidSessionId(sessionId)) {
        return false
      }
      const activeRequestId = get().activeRequestIdBySession[sessionId]
      if (activeRequestId === undefined) {
        return false
      }
      if (requestId === undefined) {
        return true
      }
      return activeRequestId === requestId
    },
    endAssistantRequest: (sessionId, requestId) => {
      if (!isValidSessionId(sessionId) || !isValidRequestId(requestId)) {
        return
      }
      set(state => {
        const nextTurnByRequestId = { ...state.turnByRequestId }
        delete nextTurnByRequestId[requestId]

        const activeRequestId = state.activeRequestIdBySession[sessionId]
        if (activeRequestId !== requestId) {
          return {
            turnByRequestId: nextTurnByRequestId,
          }
        }

        const nextActiveRequestIdBySession = { ...state.activeRequestIdBySession }
        delete nextActiveRequestIdBySession[sessionId]
        return {
          activeRequestIdBySession: nextActiveRequestIdBySession,
          turnByRequestId: nextTurnByRequestId,
        }
      })
    },
    appendUserMessage: (sessionId, text) => {
      const normalizedText = text.trim()
      if (!normalizedText || !isValidSessionId(sessionId)) {
        return
      }
      set(state => {
        const sessionsById = ensureSessionRecord(state.sessionsById, sessionId)
        const session = getSessionState(sessionsById, sessionId)
        return {
          sessionsById: {
            ...sessionsById,
            [sessionId]: {
              ...session,
              error: null,
              messages: [...session.messages, createUserMessage(normalizedText)],
            },
          },
        }
      })
    },
    appendAssistantDeltaByMessageId: (messageId, textDeltaBatch) => {
      if (!messageId.trim() || textDeltaBatch.length === 0) {
        return
      }
      set(state => {
        const patched = updateMessageById(state, messageId, message => appendStreamingDelta(message, textDeltaBatch))
        if (!patched.found || !patched.sessionId) {
          return {}
        }

        const session = getSessionState(patched.sessionsById, patched.sessionId)
        return {
          sessionsById: {
            ...patched.sessionsById,
            [patched.sessionId]: {
              ...session,
              error: null,
            },
          },
        }
      })
    },
    completeAssistantMessageByRequest: (requestId, finishReason) => {
      if (!isValidRequestId(requestId)) {
        return
      }
      set(state => {
        const turn = state.turnByRequestId[requestId]
        if (!turn) {
          return {}
        }
        const patched = updateMessageById(state, turn.assistantMessageId, message => completeAssistantStream(message, finishReason))
        if (!patched.found) {
          return {}
        }
        return {
          sessionsById: patched.sessionsById,
        }
      })
    },
    setAssistantErrorByRequest: (requestId, errorMessage) => {
      if (!isValidRequestId(requestId)) {
        return
      }
      set(state => {
        const turn = state.turnByRequestId[requestId]
        if (!turn) {
          return {}
        }
        const patched = updateMessageById(state, turn.assistantMessageId, message => markAssistantStreamError(message, errorMessage))
        if (!patched.found || !patched.sessionId) {
          return {}
        }
        const session = getSessionState(patched.sessionsById, patched.sessionId)
        return {
          sessionsById: {
            ...patched.sessionsById,
            [patched.sessionId]: {
              ...session,
              error: errorMessage,
            },
          },
        }
      })
    },
    hydrateSessionFromBackend: session => {
      if (!isValidSessionId(session.id)) {
        return
      }
      set(state => {
        if (state.activeRequestIdBySession[session.id] !== undefined) {
          return {}
        }

        const mappedMessages = mapBackendMessagesToThreadMessages(session.messages)
        const nextMessageMapping = dropMessageMappingsForSession(state.messageSessionIdByMessageId, session.id)
        for (const message of mappedMessages) {
          nextMessageMapping[message.id] = session.id
        }

        const nextActiveRequestIdBySession = { ...state.activeRequestIdBySession }
        delete nextActiveRequestIdBySession[session.id]

        const nextTurnByRequestId = { ...state.turnByRequestId }
        for (const [requestId, turn] of Object.entries(nextTurnByRequestId)) {
          if (turn?.sessionId === session.id) {
            delete nextTurnByRequestId[requestId]
          }
        }

        return {
          sessionsById: {
            ...state.sessionsById,
            [session.id]: {
              messages: mappedMessages,
              error: null,
            },
          },
          activeRequestIdBySession: nextActiveRequestIdBySession,
          turnByRequestId: nextTurnByRequestId,
          messageSessionIdByMessageId: nextMessageMapping,
        }
      })
    },
    setSessionError: (sessionId, error) => {
      if (!isValidSessionId(sessionId)) {
        return
      }
      set(state => {
        const sessionsById = ensureSessionRecord(state.sessionsById, sessionId)
        const session = getSessionState(sessionsById, sessionId)
        return {
          sessionsById: {
            ...sessionsById,
            [sessionId]: {
              ...session,
              error,
            },
          },
        }
      })
    },
    setSessionProtocolError: (sessionId, message) => {
      const normalizedMessage = message.trim()
      if (!isValidSessionId(sessionId) || normalizedMessage.length === 0) {
        return
      }
      const activeRequestId = get().activeRequestIdBySession[sessionId]
      if (activeRequestId) {
        get().actions.setSessionProtocolErrorByRequest(activeRequestId, normalizedMessage)
        return
      }
      get().actions.setSessionError(sessionId, normalizedMessage)
    },
    setSessionProtocolErrorByRequest: (requestId, message) => {
      const normalizedMessage = message.trim()
      if (!isValidRequestId(requestId) || normalizedMessage.length === 0) {
        return
      }
      set(state => {
        const turn = state.turnByRequestId[requestId]
        if (!turn) {
          return {}
        }
        const patched = updateMessageById(state, turn.assistantMessageId, messageItem =>
          markAssistantStreamError(messageItem, normalizedMessage)
        )
        if (!patched.found || !patched.sessionId) {
          return {}
        }
        const session = getSessionState(patched.sessionsById, patched.sessionId)
        return {
          sessionsById: {
            ...patched.sessionsById,
            [patched.sessionId]: {
              ...session,
              error: normalizedMessage,
            },
          },
        }
      })
    },
  },
}))

export const useThreadSessionActions = () => useThreadSessionStore(state => state.actions)

export const useThreadSessionMessages = (sessionId: string | undefined) =>
  useThreadSessionStore(state => {
    if (!sessionId) {
      return EMPTY_MESSAGES
    }
    return state.sessionsById[sessionId]?.messages ?? EMPTY_MESSAGES
  })

export const useThreadSessionError = (sessionId: string | undefined) =>
  useThreadSessionStore(state => {
    if (!sessionId) {
      return null
    }
    return state.sessionsById[sessionId]?.error ?? null
  })

export const useThreadSessionHasActiveRequest = (sessionId: string | undefined) =>
  useThreadSessionStore(state => {
    if (!sessionId) {
      return false
    }
    return state.activeRequestIdBySession[sessionId] !== undefined
  })
