import { create } from 'zustand'
import type { ChatDoneMessage } from '@agent/types'

// 消息角色：用户或助手
export type ThreadMessageRole = 'user' | 'assistant'
// 消息状态：流式中、已完成、错误
export type ThreadMessageStatus = 'streaming' | 'done' | 'error'
// 结束原因类型（来自后端 ChatDoneMessage）
type ThreadFinishReason = ChatDoneMessage['payload']['finishReason']

// 单条聊天消息
export type ThreadMessageItem = {
  id: string // 消息唯一 ID
  role: ThreadMessageRole // 角色：用户或助手
  text: string // 消息文本内容
  createdAt: number // 创建时间戳（毫秒）
  status: ThreadMessageStatus // 当前状态
  finishReason?: ThreadFinishReason // 结束原因（仅已完成/错误态有效）
  errorMessage?: string // 错误信息（仅错误态有效）
}

// 单个会话的状态：消息列表 + 会话级错误
type ThreadSessionState = {
  messages: ThreadMessageItem[] // 当前会话内的消息列表（用户 + 助手）
  error: string | null // 会话级错误提示（用于详情页顶部提示）
}

// 会话存储全局状态，按 sessionId 隔离数据，防止跨会话污染
type ThreadSessionStoreState = {
  sessionsById: Record<string, ThreadSessionState> // 按 sessionId 维护会话消息，避免跨会话串数据
  activeAssistantMessageIdBySession: Record<string, string | undefined> // 当前正在流式输出的助手消息 id（按会话隔离）
  activeRequestIdBySession: Record<string, string | undefined> // 当前进行中的助手请求 requestId（按会话隔离）
}

// 会话存储操作方法，负责消息的写入、流式增量拼接、完成/错误状态更新
type ThreadSessionStoreActions = {
  ensureSession: (sessionId: string) => void // 确保会话已初始化（无消息时也创建空壳）
  beginAssistantRequest: (sessionId: string, requestId: string) => void // 标记会话当前活跃请求
  getActiveAssistantRequestId: (sessionId: string) => string | undefined // 读取会话当前活跃请求 ID
  isActiveAssistantRequest: (sessionId: string, requestId?: string) => boolean // 判断 requestId 是否命中当前活跃请求
  endAssistantRequest: (sessionId: string, requestId: string) => void // 仅在 requestId 匹配时结束活跃请求
  appendUserMessage: (sessionId: string, text: string) => void // 追加用户消息（发送时写入）
  appendAssistantDelta: (sessionId: string, textDelta: string) => void // 消费 chat.delta，将增量拼接到助手消息
  completeAssistantMessage: (sessionId: string, finishReason: ThreadFinishReason) => void // 消费 chat.done，更新助手消息结束态
  setAssistantError: (sessionId: string, errorMessage: string) => void // 消费 chat.error，标记助手消息错误
  setSessionError: (sessionId: string, error: string | null) => void // 设置会话级错误（用于详情页错误提示）
  setSessionProtocolError: (sessionId: string, message: string) => void // 设置协议级错误（可见错误）
}

type ThreadSessionStore = ThreadSessionStoreState & { actions: ThreadSessionStoreActions }

// 空消息数组引用，避免重复创建
const EMPTY_MESSAGES: ThreadMessageItem[] = []

// 创建初始会话状态
function createInitialSessionState(): ThreadSessionState {
  return {
    messages: [],
    error: null,
  }
}

// 生成消息唯一 ID（使用 crypto API）
function createMessageId(): string {
  return crypto.randomUUID()
}

// 校验 sessionId 是否有效（非空字符串）
function isValidSessionId(sessionId: string): boolean {
  return sessionId.trim().length > 0
}

/**
 * 确保会话记录存在，不存在则创建
 * @param sessionsById 当前会话记录集
 * @param sessionId 要确保存在的会话 ID
 * @returns 新的 sessionsById 对象
 */
function ensureSessionRecord(sessionsById: Record<string, ThreadSessionState>, sessionId: string): Record<string, ThreadSessionState> {
  if (sessionsById[sessionId]) {
    return sessionsById
  }
  return {
    ...sessionsById,
    [sessionId]: createInitialSessionState(),
  }
}

// 获取会话状态，不存在则返回新建的初始状态
function getSessionState(sessionsById: Record<string, ThreadSessionState>, sessionId: string): ThreadSessionState {
  return sessionsById[sessionId] ?? createInitialSessionState()
}

/** 创建用户消息，用户消息默认是完成态（非流式） */
function createUserMessage(text: string): ThreadMessageItem {
  return {
    id: createMessageId(),
    role: 'user',
    text,
    createdAt: Date.now(),
    status: 'done',
  }
}

// 创建流式中的助手消息
function createAssistantStreamingMessage(id: string, text: string): ThreadMessageItem {
  return {
    id,
    role: 'assistant',
    text,
    createdAt: Date.now(),
    status: 'streaming',
  }
}

/**
 * 创建错误消息
 * 当收到 chat.error 且当前无 active assistant 时，补一条错误消息用于可视化提示
 */
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

// 将流式增量拼接到消息文本
function appendStreamingDelta(message: ThreadMessageItem, textDelta: string): ThreadMessageItem {
  return {
    ...message,
    text: `${message.text}${textDelta}`,
    status: 'streaming',
  }
}

// 完成助手消息流式输出
function completeAssistantStream(message: ThreadMessageItem, finishReason: ThreadFinishReason): ThreadMessageItem {
  const nextStatus: ThreadMessageStatus = finishReason === 'error' ? 'error' : 'done'
  return {
    ...message,
    status: nextStatus,
    finishReason,
  }
}

// 标记助手消息为错误态
function markAssistantStreamError(message: ThreadMessageItem, errorMessage: string): ThreadMessageItem {
  return {
    ...message,
    status: 'error',
    finishReason: 'error',
    errorMessage,
  }
}

const useThreadSessionStore = create<ThreadSessionStore>((set, get) => ({
  sessionsById: {},
  activeAssistantMessageIdBySession: {},
  activeRequestIdBySession: {},
  actions: {
    /** 确保会话存在，若不存在则初始化空会话 */
    ensureSession: sessionId => {
      if (!isValidSessionId(sessionId)) {
        return
      }
      set(state => ({
        sessionsById: ensureSessionRecord(state.sessionsById, sessionId),
      }))
    },
    /** 开始一个新的助手请求，按 sessionId 记录 active requestId */
    beginAssistantRequest: (sessionId, requestId) => {
      if (!isValidSessionId(sessionId) || requestId.trim().length === 0) {
        return
      }
      set(state => ({
        activeRequestIdBySession: {
          ...state.activeRequestIdBySession,
          [sessionId]: requestId,
        },
      }))
    },
    /** 获取会话当前 active requestId */
    getActiveAssistantRequestId: sessionId => {
      if (!isValidSessionId(sessionId)) {
        return undefined
      }
      return get().activeRequestIdBySession[sessionId]
    },
    /** 判断给定 requestId 是否命中当前活跃请求；requestId 缺省时判断是否存在 active 请求 */
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
    /** 结束助手请求：仅当 requestId 与当前 active 一致时才清理 */
    endAssistantRequest: (sessionId, requestId) => {
      if (!isValidSessionId(sessionId) || requestId.trim().length === 0) {
        return
      }
      set(state => {
        const activeRequestId = state.activeRequestIdBySession[sessionId]
        if (activeRequestId !== requestId) {
          return {}
        }

        const nextActiveRequestIdBySession = { ...state.activeRequestIdBySession }
        delete nextActiveRequestIdBySession[sessionId]
        return {
          activeRequestIdBySession: nextActiveRequestIdBySession,
        }
      })
    },
    /** 追加用户消息，写入后清空会话级错误 */
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
    /** 处理流式增量，若存在 activeAssistantMessageId 则追加到该消息；否则创建新消息 */
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
    /** 完成助手消息流式，标记结束原因并清理 active 状态 */
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
    /** 处理助手消息错误，若有 active 消息则标记该消息为错误；否则创建一条错误消息 */
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
    /** 设置会话级错误（不影响消息列表） */
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
    /** 设置协议错误：写入会话级错误；若存在流式中的助手消息则将其标记为错误态 */
    setSessionProtocolError: (sessionId, message) => {
      const normalizedMessage = message.trim()
      if (!isValidSessionId(sessionId) || normalizedMessage.length === 0) {
        return
      }

      set(state => {
        const sessionsById = ensureSessionRecord(state.sessionsById, sessionId)
        const session = getSessionState(sessionsById, sessionId)
        const activeAssistantMessageId = state.activeAssistantMessageIdBySession[sessionId]

        if (!activeAssistantMessageId) {
          return {
            sessionsById: {
              ...sessionsById,
              [sessionId]: {
                ...session,
                error: normalizedMessage,
              },
            },
          }
        }

        let found = false
        const messages: ThreadMessageItem[] = session.messages.map(messageItem => {
          if (messageItem.id !== activeAssistantMessageId) {
            return messageItem
          }
          found = true
          return markAssistantStreamError(messageItem, normalizedMessage)
        })

        if (!found) {
          return {
            sessionsById: {
              ...sessionsById,
              [sessionId]: {
                ...session,
                error: normalizedMessage,
              },
            },
          }
        }

        const nextActiveBySession = { ...state.activeAssistantMessageIdBySession }
        delete nextActiveBySession[sessionId]

        return {
          sessionsById: {
            ...sessionsById,
            [sessionId]: {
              ...session,
              error: normalizedMessage,
              messages,
            },
          },
          activeAssistantMessageIdBySession: nextActiveBySession,
        }
      })
    },
  },
}))

// 导出所有 actions
export const useThreadSessionActions = () => useThreadSessionStore(state => state.actions)

/**
 * 获取指定会话的消息列表
 * @param sessionId 会话 ID，传入 undefined 时返回空数组
 */
export const useThreadSessionMessages = (sessionId: string | undefined) =>
  useThreadSessionStore(state => {
    if (!sessionId) {
      return EMPTY_MESSAGES
    }
    return state.sessionsById[sessionId]?.messages ?? EMPTY_MESSAGES
  })

/**
 * 获取指定会话的错误信息
 * @param sessionId 会话 ID，传入 undefined 时返回 null
 */
export const useThreadSessionError = (sessionId: string | undefined) =>
  useThreadSessionStore(state => {
    if (!sessionId) {
      return null
    }
    return state.sessionsById[sessionId]?.error ?? null
  })
