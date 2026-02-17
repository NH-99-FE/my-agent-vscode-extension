import { create } from 'zustand'
import type { ChatDoneMessage } from '@agent/types'

export type ThreadMessageRole = 'user' | 'assistant'
export type ThreadMessageStatus = 'streaming' | 'done' | 'error'
type ThreadFinishReason = ChatDoneMessage['payload']['finishReason']

export type ThreadMessageItem = {
  id: string
  role: ThreadMessageRole
  text: string
  createdAt: number
  status: ThreadMessageStatus
  finishReason?: ThreadFinishReason
  errorMessage?: string
}

type ThreadSessionState = {
  /** 当前会话内的消息列表（用户 + 助手）。 */
  messages: ThreadMessageItem[]
  /** 会话级错误提示（用于详情页顶部提示）。 */
  error: string | null
}

type ThreadSessionStoreState = {
  /** 按 sessionId 维护会话消息，避免跨会话串数据。 */
  sessionsById: Record<string, ThreadSessionState>
  /** 当前正在流式输出的助手消息 id（按会话隔离）。 */
  activeAssistantMessageIdBySession: Record<string, string | undefined>
}

type ThreadSessionStoreActions = {
  /** 确保会话已初始化（无消息时也创建空壳）。 */
  ensureSession: (sessionId: string) => void
  /** 追加用户消息（发送时写入）。 */
  appendUserMessage: (sessionId: string, text: string) => void
  /** 消费 chat.delta，将增量拼接到助手消息。 */
  appendAssistantDelta: (sessionId: string, textDelta: string) => void
  /** 消费 chat.done，更新助手消息结束态。 */
  completeAssistantMessage: (sessionId: string, finishReason: ThreadFinishReason) => void
  /** 消费 chat.error，标记助手消息错误。 */
  setAssistantError: (sessionId: string, errorMessage: string) => void
  /** 设置会话级错误（用于详情页错误提示）。 */
  setSessionError: (sessionId: string, error: string | null) => void
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

// 保证某个 sessionId 在 sessionsById 中存在。
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

// 用户消息默认是完成态（非流式）。
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

// 当收到 chat.error 且当前无 active assistant 时，补一条错误消息用于可视化提示。
function createAssistantErrorMessage(errorMessage: string): ThreadMessageItem {
  return {
    id: createMessageId(),
    role: 'assistant',
    text: errorMessage,
    createdAt: Date.now(),
    status: 'error',
    finishReason: 'error',
    errorMessage,
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

const useThreadSessionStore = create<ThreadSessionStore>(set => ({
  sessionsById: {},
  activeAssistantMessageIdBySession: {},
  actions: {
    ensureSession: sessionId => {
      if (!isValidSessionId(sessionId)) {
        return
      }
      set(state => ({
        sessionsById: ensureSessionRecord(state.sessionsById, sessionId),
      }))
    },
    appendUserMessage: (sessionId, text) => {
      const normalizedText = text.trim()
      if (!normalizedText || !isValidSessionId(sessionId)) {
        return
      }
      set(state => {
        const sessionsById = ensureSessionRecord(state.sessionsById, sessionId)
        const session = getSessionState(sessionsById, sessionId)
        const nextSession: ThreadSessionState = {
          ...session,
          error: null,
          messages: [...session.messages, createUserMessage(normalizedText)],
        }

        return {
          sessionsById: {
            ...sessionsById,
            [sessionId]: nextSession,
          },
        }
      })
    },
    appendAssistantDelta: (sessionId, textDelta) => {
      if (!isValidSessionId(sessionId) || !textDelta) {
        return
      }
      set(state => {
        const sessionsById = ensureSessionRecord(state.sessionsById, sessionId)
        const session = getSessionState(sessionsById, sessionId)
        const activeAssistantMessageId = state.activeAssistantMessageIdBySession[sessionId]
        const nextActiveBySession = { ...state.activeAssistantMessageIdBySession }

        if (activeAssistantMessageId) {
          let matchedActiveMessage = false
          const messages: ThreadMessageItem[] = session.messages.map(message => {
            if (message.id !== activeAssistantMessageId) {
              return message
            }
            matchedActiveMessage = true
            return appendStreamingDelta(message, textDelta)
          })

          if (matchedActiveMessage) {
            const nextSession: ThreadSessionState = {
              ...session,
              error: null,
              messages,
            }
            return {
              sessionsById: {
                ...sessionsById,
                [sessionId]: nextSession,
              },
              activeAssistantMessageIdBySession: nextActiveBySession,
            }
          }
        }

        const messageId = createMessageId()
        nextActiveBySession[sessionId] = messageId
        const nextSession: ThreadSessionState = {
          ...session,
          error: null,
          messages: [...session.messages, createAssistantStreamingMessage(messageId, textDelta)],
        }

        return {
          sessionsById: {
            ...sessionsById,
            [sessionId]: nextSession,
          },
          activeAssistantMessageIdBySession: nextActiveBySession,
        }
      })
    },
    completeAssistantMessage: (sessionId, finishReason) => {
      if (!isValidSessionId(sessionId)) {
        return
      }
      set(state => {
        const sessionsById = ensureSessionRecord(state.sessionsById, sessionId)
        const session = getSessionState(sessionsById, sessionId)
        const activeAssistantMessageId = state.activeAssistantMessageIdBySession[sessionId]
        const nextActiveBySession = { ...state.activeAssistantMessageIdBySession }
        delete nextActiveBySession[sessionId]

        if (!activeAssistantMessageId) {
          return {
            activeAssistantMessageIdBySession: nextActiveBySession,
          }
        }

        const messages: ThreadMessageItem[] = session.messages.map(message => {
          if (message.id !== activeAssistantMessageId) {
            return message
          }
          return completeAssistantStream(message, finishReason)
        })

        const nextSession: ThreadSessionState = {
          ...session,
          messages,
        }

        return {
          sessionsById: {
            ...sessionsById,
            [sessionId]: nextSession,
          },
          activeAssistantMessageIdBySession: nextActiveBySession,
        }
      })
    },
    setAssistantError: (sessionId, errorMessage) => {
      if (!isValidSessionId(sessionId)) {
        return
      }
      set(state => {
        const sessionsById = ensureSessionRecord(state.sessionsById, sessionId)
        const session = getSessionState(sessionsById, sessionId)
        const activeAssistantMessageId = state.activeAssistantMessageIdBySession[sessionId]
        const nextActiveBySession = { ...state.activeAssistantMessageIdBySession }
        delete nextActiveBySession[sessionId]

        if (!activeAssistantMessageId) {
          const nextSession: ThreadSessionState = {
            ...session,
            error: errorMessage,
            messages: [...session.messages, createAssistantErrorMessage(errorMessage)],
          }
          return {
            sessionsById: {
              ...sessionsById,
              [sessionId]: nextSession,
            },
            activeAssistantMessageIdBySession: nextActiveBySession,
          }
        }

        const messages: ThreadMessageItem[] = session.messages.map(message => {
          if (message.id !== activeAssistantMessageId) {
            return message
          }
          return markAssistantStreamError(message, errorMessage)
        })
        const nextSession: ThreadSessionState = {
          ...session,
          error: errorMessage,
          messages,
        }

        return {
          sessionsById: {
            ...sessionsById,
            [sessionId]: nextSession,
          },
          activeAssistantMessageIdBySession: nextActiveBySession,
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
        const nextSession: ThreadSessionState = {
          ...session,
          error,
        }
        return {
          sessionsById: {
            ...sessionsById,
            [sessionId]: nextSession,
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
