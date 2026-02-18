import { create } from 'zustand'
import type { ChatAttachment, ReasoningLevel } from '@agent/types'

// 最大附件数量限制
export const MAX_CONTEXT_FILES = 20
// 超出附件数量限制时的提示文案
export const CONTEXT_FILES_LIMIT_NOTICE = `最多添加 ${MAX_CONTEXT_FILES} 个附件`

// 默认模型与推理强度配置
const DEFAULT_MODEL = 'gpt-5.3-codex'
const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'low'
// 本地兜底会话 ID：在没有路由 threadId 时使用此 ID 作为临时会话
const DEFAULT_LOCAL_SESSION_ID = crypto.randomUUID()

// 聊天输入区草稿数据，每个会话维护独立的草稿，切换会话时不会串内容
type ThreadComposerDraft = {
  text: string // 会话草稿文本
  model: string // 会话草稿模型选择
  reasoningLevel: ReasoningLevel // 会话草稿推理强度
  attachments: ChatAttachment[] // 会话草稿附件列表
  inlineNotice: string | null // 会话内联提示（上限、错误等）
}

// 聊天输入区全局状态，负责管理会话隔离的草稿、发送态和文件选择请求关联
type ThreadComposerState = {
  localSessionId: string // 本地兜底会话 ID：无路由 threadId 时复用该值
  localSessionUsed: boolean // 标记本地会话是否已被使用（发送过消息）
  sessionId: string // 当前活跃会话 ID（路由优先，否则回落到 localSessionId）
  draftsBySession: Record<string, ThreadComposerDraft> // 按会话维护草稿，避免切换 thread 时串会话
  sendingBySession: Record<string, boolean> // 按会话维护发送态，避免跨会话回包导致 sending 悬挂
  pendingContextPickByRequestId: Record<string, string> // 记录文件选择请求与发起会话的映射，避免回包错落会话
}

// 聊天输入区操作方法，所有方法均为幂等设计，支持指定目标会话操作
type ThreadComposerActions = {
  initSession: (routeThreadId?: string) => void // 根据路由会话初始化当前 session，并恢复/创建对应草稿
  setText: (text: string) => void // 更新当前会话输入框文本
  setModel: (model: string) => void // 更新当前会话模型选择
  setReasoningLevel: (reasoningLevel: ReasoningLevel) => void // 更新当前会话推理强度选择
  addPickedFiles: (files: ChatAttachment[], targetSessionId?: string) => void // 合并文件选择结果（去重 + 上限控制），可指定写入目标会话
  markPendingContextPick: (requestId: string, targetSessionId?: string) => void // 记录一次文件选择请求所属会话
  consumePendingContextPickSession: (requestId?: string) => string | undefined // 消费文件选择回包关联，返回目标会话并清理 pending 映射
  removeAttachment: (path: string) => void // 删除当前会话单个附件
  clearAttachments: (targetSessionId?: string) => void // 清空指定会话附件（默认当前会话）
  setSending: (targetSessionId: string, isSending: boolean) => void // 标记指定会话是否发送中
  setInlineNotice: (message: string | null, targetSessionId?: string) => void // 更新指定会话内联提示（默认当前会话）
}

type ThreadComposerStore = ThreadComposerState & { actions: ThreadComposerActions }

// 创建默认草稿数据
function createDefaultDraft(): ThreadComposerDraft {
  return {
    text: '',
    model: DEFAULT_MODEL,
    reasoningLevel: DEFAULT_REASONING_LEVEL,
    attachments: [],
    inlineNotice: null,
  }
}

// 兜底草稿引用，避免重复创建
const FALLBACK_DRAFT = createDefaultDraft()

/**
 * 解析目标会话 ID
 * @param state 当前状态
 * @param targetSessionId 可选的目标会话 ID
 * @returns 解析后的会话 ID
 */
function resolveSessionId(state: ThreadComposerState, targetSessionId?: string): string {
  return targetSessionId ?? state.sessionId
}

/**
 * 获取指定会话的草稿
 * @param state 当前状态
 * @param targetSessionId 可选的目标会话 ID
 * @returns 草稿数据，不存在则返回兜底草稿
 */
function getDraftOrDefault(state: ThreadComposerState, targetSessionId?: string): ThreadComposerDraft {
  const resolvedSessionId = resolveSessionId(state, targetSessionId)
  return state.draftsBySession[resolvedSessionId] ?? FALLBACK_DRAFT
}

const useThreadComposerStore = create<ThreadComposerStore>((set, get) => ({
  localSessionId: DEFAULT_LOCAL_SESSION_ID,
  localSessionUsed: false,
  sessionId: DEFAULT_LOCAL_SESSION_ID,
  draftsBySession: {
    [DEFAULT_LOCAL_SESSION_ID]: createDefaultDraft(),
  },
  sendingBySession: {},
  pendingContextPickByRequestId: {},
  actions: {
    initSession: routeThreadId => {
      // 1. 如果有路由 threadId，直接使用（查看历史详情页）
      if (routeThreadId) {
        set(state => ({
          sessionId: routeThreadId,
          draftsBySession: state.draftsBySession[routeThreadId]
            ? state.draftsBySession
            : {
                ...state.draftsBySession,
                [routeThreadId]: createDefaultDraft(),
              },
        }))
        return
      }

      // 2. 如果是 Home 页（无 routeThreadId），检查当前 localSessionId 是否已被使用
      // 如果已被使用（发送过消息），则生成新的 ID，确保“新聊天”总是新的
      set(state => {
        let nextLocalId = state.localSessionId
        let nextLocalUsed = state.localSessionUsed

        if (state.localSessionUsed) {
          nextLocalId = crypto.randomUUID()
          nextLocalUsed = false
        }

        return {
          localSessionId: nextLocalId,
          localSessionUsed: nextLocalUsed,
          sessionId: nextLocalId,
          draftsBySession: state.draftsBySession[nextLocalId]
            ? state.draftsBySession
            : {
                ...state.draftsBySession,
                [nextLocalId]: createDefaultDraft(),
              },
        }
      })
    },
    setText: text => {
      set(state => {
        const currentDraft = getDraftOrDefault(state)
        return {
          draftsBySession: {
            ...state.draftsBySession,
            [state.sessionId]: {
              ...currentDraft,
              text,
            },
          },
        }
      })
    },
    setModel: model => {
      set(state => {
        const currentDraft = getDraftOrDefault(state)
        return {
          draftsBySession: {
            ...state.draftsBySession,
            [state.sessionId]: {
              ...currentDraft,
              model,
            },
          },
        }
      })
    },
    setReasoningLevel: reasoningLevel => {
      set(state => {
        const currentDraft = getDraftOrDefault(state)
        return {
          draftsBySession: {
            ...state.draftsBySession,
            [state.sessionId]: {
              ...currentDraft,
              reasoningLevel,
            },
          },
        }
      })
    },
    addPickedFiles: (files, targetSessionId) => {
      set(state => {
        const resolvedSessionId = resolveSessionId(state, targetSessionId)
        const currentDraft = getDraftOrDefault(state, resolvedSessionId)
        const seenPaths = new Set(currentDraft.attachments.map(file => file.path))
        const merged = [...currentDraft.attachments]
        let hitLimit = false

        for (const file of files) {
          if (seenPaths.has(file.path)) {
            continue
          }
          // 上限后继续消费输入，统一标记 hitLimit，最终给出一次提示。
          if (merged.length >= MAX_CONTEXT_FILES) {
            hitLimit = true
            continue
          }
          seenPaths.add(file.path)
          merged.push({
            path: file.path,
            name: file.name,
          })
        }

        return {
          draftsBySession: {
            ...state.draftsBySession,
            [resolvedSessionId]: {
              ...currentDraft,
              attachments: merged,
              inlineNotice: hitLimit ? CONTEXT_FILES_LIMIT_NOTICE : null,
            },
          },
        }
      })
    },
    markPendingContextPick: (requestId, targetSessionId) => {
      set(state => {
        const resolvedSessionId = resolveSessionId(state, targetSessionId)
        return {
          pendingContextPickByRequestId: {
            ...state.pendingContextPickByRequestId,
            [requestId]: resolvedSessionId,
          },
        }
      })
    },
    consumePendingContextPickSession: requestId => {
      if (!requestId) {
        return undefined
      }

      const pendingSessionId = get().pendingContextPickByRequestId[requestId]
      if (!pendingSessionId) {
        return undefined
      }

      set(state => {
        const nextPendingMap = { ...state.pendingContextPickByRequestId }
        delete nextPendingMap[requestId]
        return {
          pendingContextPickByRequestId: nextPendingMap,
        }
      })

      return pendingSessionId
    },
    removeAttachment: path => {
      set(state => {
        const currentDraft = getDraftOrDefault(state)
        return {
          draftsBySession: {
            ...state.draftsBySession,
            [state.sessionId]: {
              ...currentDraft,
              attachments: currentDraft.attachments.filter(file => file.path !== path),
              inlineNotice: null,
            },
          },
        }
      })
    },
    clearAttachments: targetSessionId => {
      set(state => {
        const resolvedSessionId = resolveSessionId(state, targetSessionId)
        const draft = getDraftOrDefault(state, resolvedSessionId)
        return {
          draftsBySession: {
            ...state.draftsBySession,
            [resolvedSessionId]: {
              ...draft,
              attachments: [],
            },
          },
        }
      })
    },
    setSending: (targetSessionId, isSending) => {
      set(state => {
        // 如果正在使用 localSessionId 发送消息，标记为已使用
        // 下次进入 Home 时会生成新的 localId
        const nextLocalSessionUsed = targetSessionId === state.localSessionId ? true : state.localSessionUsed

        return {
          sendingBySession: {
            ...state.sendingBySession,
            [targetSessionId]: isSending,
          },
          localSessionUsed: nextLocalSessionUsed,
        }
      })
    },
    setInlineNotice: (message, targetSessionId) => {
      set(state => {
        const resolvedSessionId = resolveSessionId(state, targetSessionId)
        const draft = getDraftOrDefault(state, resolvedSessionId)
        return {
          draftsBySession: {
            ...state.draftsBySession,
            [resolvedSessionId]: {
              ...draft,
              inlineNotice: message,
            },
          },
        }
      })
    },
  },
}))

/**
 * 选择当前会话的草稿数据
 * @param state store 完整状态
 * @returns 当前会话的草稿数据
 */
function selectCurrentDraft(state: ThreadComposerStore): ThreadComposerDraft {
  return state.draftsBySession[state.sessionId] ?? FALLBACK_DRAFT
}

// ==================== Hook 导出 ====================

// 统一导出 actions，避免组件直接订阅整个 store
export const useThreadComposerActions = () => useThreadComposerStore(state => state.actions)
// 仅订阅当前 sessionId
export const useThreadComposerSessionId = () => useThreadComposerStore(state => state.sessionId)
// 仅订阅当前会话输入文本
export const useThreadComposerText = () => useThreadComposerStore(state => selectCurrentDraft(state).text)
// 仅订阅当前会话模型
export const useThreadComposerModel = () => useThreadComposerStore(state => selectCurrentDraft(state).model)
// 仅订阅当前会话推理强度
export const useThreadComposerReasoningLevel = () => useThreadComposerStore(state => selectCurrentDraft(state).reasoningLevel)
// 仅订阅当前会话附件列表
export const useThreadComposerAttachments = () => useThreadComposerStore(state => selectCurrentDraft(state).attachments)
// 仅订阅当前会话内联提示
export const useThreadComposerInlineNotice = () => useThreadComposerStore(state => selectCurrentDraft(state).inlineNotice)
// 仅订阅当前会话发送态
export const useThreadComposerIsSending = () => useThreadComposerStore(state => state.sendingBySession[state.sessionId] ?? false)

// 派生发送可用性：条件为非发送中 且（有文本或有附件）且（有选择模型）
export const useThreadComposerCanSend = () =>
  useThreadComposerStore(state => {
    const draft = selectCurrentDraft(state)
    const isSending = state.sendingBySession[state.sessionId] ?? false
    const hasModel = draft.model.trim().length > 0
    const hasInput = draft.text.trim().length > 0 || draft.attachments.length > 0
    return !isSending && hasModel && hasInput
  })
