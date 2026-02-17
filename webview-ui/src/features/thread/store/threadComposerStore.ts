import { create } from 'zustand'
import type { ChatAttachment, ReasoningLevel } from '@agent/types'

export const MAX_CONTEXT_FILES = 20
export const CONTEXT_FILES_LIMIT_NOTICE = `最多添加 ${MAX_CONTEXT_FILES} 个附件`

const DEFAULT_MODEL = 'gpt-5.3-codex'
const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'low'
const DEFAULT_LOCAL_SESSION_ID = crypto.randomUUID()

type ThreadComposerDraft = {
  /** 会话草稿文本。 */
  text: string
  /** 会话草稿模型选择。 */
  model: string
  /** 会话草稿推理强度。 */
  reasoningLevel: ReasoningLevel
  /** 会话草稿附件列表。 */
  attachments: ChatAttachment[]
  /** 会话内联提示（上限、错误等）。 */
  inlineNotice: string | null
}

type ThreadComposerState = {
  /** 本地兜底会话 ID：无路由 threadId 时复用该值。 */
  localSessionId: string
  /** 当前活跃会话 ID（路由优先，否则回落到 localSessionId）。 */
  sessionId: string
  /** 按会话维护草稿，避免切换 thread 时串会话。 */
  draftsBySession: Record<string, ThreadComposerDraft>
  /** 按会话维护发送态，避免跨会话回包导致 sending 悬挂。 */
  sendingBySession: Record<string, boolean>
  /** 记录文件选择请求与发起会话的映射，避免回包错落会话。 */
  pendingContextPickByRequestId: Record<string, string>
}

type ThreadComposerActions = {
  /** 根据路由会话初始化当前 session，并恢复/创建对应草稿。 */
  initSession: (routeThreadId?: string) => void
  /** 更新当前会话输入框文本。 */
  setText: (text: string) => void
  /** 更新当前会话模型选择。 */
  setModel: (model: string) => void
  /** 更新当前会话推理强度选择。 */
  setReasoningLevel: (reasoningLevel: ReasoningLevel) => void
  /** 合并文件选择结果（去重 + 上限控制），可指定写入目标会话。 */
  addPickedFiles: (files: ChatAttachment[], targetSessionId?: string) => void
  /** 记录一次文件选择请求所属会话。 */
  markPendingContextPick: (requestId: string, targetSessionId?: string) => void
  /** 消费文件选择回包关联，返回目标会话并清理 pending 映射。 */
  consumePendingContextPickSession: (requestId?: string) => string | undefined
  /** 删除当前会话单个附件。 */
  removeAttachment: (path: string) => void
  /** 清空指定会话附件（默认当前会话）。 */
  clearAttachments: (targetSessionId?: string) => void
  /** 标记指定会话是否发送中。 */
  setSending: (targetSessionId: string, isSending: boolean) => void
  /** 更新指定会话内联提示（默认当前会话）。 */
  setInlineNotice: (message: string | null, targetSessionId?: string) => void
}

type ThreadComposerStore = ThreadComposerState & { actions: ThreadComposerActions }

function createDefaultDraft(): ThreadComposerDraft {
  return {
    text: '',
    model: DEFAULT_MODEL,
    reasoningLevel: DEFAULT_REASONING_LEVEL,
    attachments: [],
    inlineNotice: null,
  }
}

const FALLBACK_DRAFT = createDefaultDraft()

function resolveSessionId(state: ThreadComposerState, targetSessionId?: string): string {
  return targetSessionId ?? state.sessionId
}

function getDraftOrDefault(state: ThreadComposerState, targetSessionId?: string): ThreadComposerDraft {
  const resolvedSessionId = resolveSessionId(state, targetSessionId)
  return state.draftsBySession[resolvedSessionId] ?? FALLBACK_DRAFT
}

const useThreadComposerStore = create<ThreadComposerStore>((set, get) => ({
  localSessionId: DEFAULT_LOCAL_SESSION_ID,
  sessionId: DEFAULT_LOCAL_SESSION_ID,
  draftsBySession: {
    [DEFAULT_LOCAL_SESSION_ID]: createDefaultDraft(),
  },
  sendingBySession: {},
  pendingContextPickByRequestId: {},
  actions: {
    initSession: routeThreadId => {
      const fallbackSessionId = get().localSessionId
      const nextSessionId = routeThreadId ?? fallbackSessionId

      set(state => ({
        sessionId: nextSessionId,
        draftsBySession: state.draftsBySession[nextSessionId]
          ? state.draftsBySession
          : {
              ...state.draftsBySession,
              [nextSessionId]: createDefaultDraft(),
            },
      }))
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
      set(state => ({
        sendingBySession: {
          ...state.sendingBySession,
          [targetSessionId]: isSending,
        },
      }))
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

function selectCurrentDraft(state: ThreadComposerStore): ThreadComposerDraft {
  return state.draftsBySession[state.sessionId] ?? FALLBACK_DRAFT
}

/** 统一导出 actions，避免组件直接订阅整个 store。 */
export const useThreadComposerActions = () => useThreadComposerStore(state => state.actions)
/** 仅订阅当前 sessionId。 */
export const useThreadComposerSessionId = () => useThreadComposerStore(state => state.sessionId)
/** 仅订阅当前会话输入文本。 */
export const useThreadComposerText = () => useThreadComposerStore(state => selectCurrentDraft(state).text)
/** 仅订阅当前会话模型。 */
export const useThreadComposerModel = () => useThreadComposerStore(state => selectCurrentDraft(state).model)
/** 仅订阅当前会话推理强度。 */
export const useThreadComposerReasoningLevel = () => useThreadComposerStore(state => selectCurrentDraft(state).reasoningLevel)
/** 仅订阅当前会话附件列表。 */
export const useThreadComposerAttachments = () => useThreadComposerStore(state => selectCurrentDraft(state).attachments)
/** 仅订阅当前会话内联提示。 */
export const useThreadComposerInlineNotice = () => useThreadComposerStore(state => selectCurrentDraft(state).inlineNotice)
/** 仅订阅当前会话发送态。 */
export const useThreadComposerIsSending = () => useThreadComposerStore(state => state.sendingBySession[state.sessionId] ?? false)
/** 派生发送可用性：非发送中且（有文本或有附件）才可发送。 */
export const useThreadComposerCanSend = () =>
  useThreadComposerStore(state => {
    const draft = selectCurrentDraft(state)
    const isSending = state.sendingBySession[state.sessionId] ?? false
    const hasModel = draft.model.trim().length > 0
    const hasInput = draft.text.trim().length > 0 || draft.attachments.length > 0
    return !isSending && hasModel && hasInput
  })
