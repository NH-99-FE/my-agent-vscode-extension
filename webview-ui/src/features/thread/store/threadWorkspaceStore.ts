import { create } from 'zustand'
import type { ProviderDefault, SettingsStateMessage } from '@agent/types'

type SettingsDraft = {
  providerDefault: ProviderDefault
  openaiBaseUrl: string
  defaultModel: string
  modelsText: string
  apiKeyInput: string
}

type SettingsRuntimeState = {
  hasOpenAiApiKey: boolean
  isLoading: boolean
  isSaving: boolean
  error: string | null
}

export type ThreadHistoryItem = {
  /** 会话唯一 ID（与路由 :threadId 一致）。 */
  sessionId: string
  /** 历史列表展示标题（由消息摘要生成）。 */
  title: string
  /** 最近更新时间戳（毫秒），用于排序与时间文案。 */
  updatedAt: number
}

type ThreadWorkspaceState = {
  isSettingsOpen: boolean
  isCreatingSession: boolean
  /** 前端本地历史记录：仅用于 UI 展示，不等价于后端持久化。 */
  threadHistory: ThreadHistoryItem[]
  settingsDraft: SettingsDraft
  settingsRuntime: SettingsRuntimeState
}

type ThreadWorkspaceActions = {
  setSettingsOpen: (open: boolean) => void
  toggleSettingsOpen: () => void
  beginCreateSession: () => void
  finishCreateSession: () => void
  beginSettingsLoad: () => void
  beginSettingsSave: () => void
  applySettingsSnapshot: (snapshot: SettingsStateMessage['payload']) => void
  setSettingsError: (message: string | null) => void
  setSettingsProviderDefault: (providerDefault: ProviderDefault) => void
  setSettingsOpenaiBaseUrl: (openaiBaseUrl: string) => void
  setSettingsDefaultModel: (defaultModel: string) => void
  setSettingsModelsText: (modelsText: string) => void
  setSettingsApiKeyInput: (apiKeyInput: string) => void
  clearSettingsApiKeyInput: () => void
  /** 新增或更新历史项（同 sessionId 去重并刷新排序）。 */
  upsertThreadHistory: (item: ThreadHistoryItem) => void
  /** 删除单条历史项。 */
  removeThreadHistory: (sessionId: string) => void
}

type ThreadWorkspaceStore = ThreadWorkspaceState & { actions: ThreadWorkspaceActions }

const useThreadWorkspaceStore = create<ThreadWorkspaceStore>((set, get) => ({
  isSettingsOpen: false,
  isCreatingSession: false,
  threadHistory: [],
  settingsDraft: {
    providerDefault: 'auto',
    openaiBaseUrl: '',
    defaultModel: '',
    modelsText: '',
    apiKeyInput: '',
  },
  settingsRuntime: {
    hasOpenAiApiKey: false,
    isLoading: false,
    isSaving: false,
    error: null,
  },
  actions: {
    setSettingsOpen: open => {
      set({ isSettingsOpen: open })
    },
    toggleSettingsOpen: () => {
      set({ isSettingsOpen: !get().isSettingsOpen })
    },
    beginCreateSession: () => {
      set({ isCreatingSession: true })
    },
    finishCreateSession: () => {
      set({ isCreatingSession: false })
    },
    beginSettingsLoad: () => {
      set(state => ({
        settingsRuntime: {
          ...state.settingsRuntime,
          isLoading: true,
          error: null,
        },
      }))
    },
    beginSettingsSave: () => {
      set(state => ({
        settingsRuntime: {
          ...state.settingsRuntime,
          isSaving: true,
          error: null,
        },
      }))
    },
    applySettingsSnapshot: snapshot => {
      const rawPayload = snapshot as unknown as Record<string, unknown>
      const hasDefaultModelField = Object.prototype.hasOwnProperty.call(rawPayload, 'openaiDefaultModel')
      const hasModelsField = Object.prototype.hasOwnProperty.call(rawPayload, 'openaiModels')
      // 后端快照是 settings 的单一可信源，写入后清理 loading/saving。
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          providerDefault: snapshot.providerDefault,
          openaiBaseUrl: snapshot.openaiBaseUrl,
          defaultModel:
            hasDefaultModelField && typeof rawPayload.openaiDefaultModel === 'string'
              ? rawPayload.openaiDefaultModel.trim()
              : state.settingsDraft.defaultModel,
          modelsText: hasModelsField ? normalizeModelList(rawPayload.openaiModels).join('\n') : state.settingsDraft.modelsText,
          apiKeyInput: '',
        },
        settingsRuntime: {
          ...state.settingsRuntime,
          hasOpenAiApiKey: snapshot.hasOpenAiApiKey,
          isLoading: false,
          isSaving: false,
          error: null,
        },
      }))
    },
    setSettingsError: message => {
      set(state => ({
        settingsRuntime: {
          ...state.settingsRuntime,
          isLoading: false,
          isSaving: false,
          error: message,
        },
      }))
    },
    setSettingsProviderDefault: providerDefault => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          providerDefault,
        },
      }))
    },
    setSettingsOpenaiBaseUrl: openaiBaseUrl => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          openaiBaseUrl,
        },
      }))
    },
    setSettingsDefaultModel: defaultModel => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          defaultModel,
        },
      }))
    },
    setSettingsModelsText: modelsText => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          modelsText,
        },
      }))
    },
    setSettingsApiKeyInput: apiKeyInput => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          apiKeyInput,
        },
      }))
    },
    clearSettingsApiKeyInput: () => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          apiKeyInput: '',
        },
      }))
    },
    upsertThreadHistory: item => {
      const normalizedSessionId = item.sessionId.trim()
      const normalizedTitle = item.title.trim()
      if (!normalizedSessionId) {
        return
      }

      set(state => {
        const nextItem: ThreadHistoryItem = {
          sessionId: normalizedSessionId,
          title: normalizedTitle || '新会话',
          updatedAt: item.updatedAt,
        }
        const deduped = state.threadHistory.filter(historyItem => historyItem.sessionId !== normalizedSessionId)
        const nextHistory = [nextItem, ...deduped].sort((a, b) => b.updatedAt - a.updatedAt)
        return {
          threadHistory: nextHistory,
        }
      })
    },
    removeThreadHistory: sessionId => {
      const normalizedSessionId = sessionId.trim()
      if (!normalizedSessionId) {
        return
      }
      set(state => ({
        threadHistory: state.threadHistory.filter(item => item.sessionId !== normalizedSessionId),
      }))
    },
  },
}))

function normalizeModelList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const deduped = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }
    const normalized = item.trim()
    if (!normalized) {
      continue
    }
    deduped.add(normalized)
  }
  return [...deduped]
}

export function parseModelsText(modelsText: string): string[] {
  const deduped = new Set<string>()
  const lines = modelsText.split('\n')
  for (const line of lines) {
    const normalized = line.trim()
    if (!normalized) {
      continue
    }
    deduped.add(normalized)
  }
  return [...deduped]
}

export const useThreadWorkspaceActions = () => useThreadWorkspaceStore(state => state.actions)
export const useIsSettingsOpen = () => useThreadWorkspaceStore(state => state.isSettingsOpen)
export const useIsCreatingSession = () => useThreadWorkspaceStore(state => state.isCreatingSession)
export const useThreadHistoryItems = () => useThreadWorkspaceStore(state => state.threadHistory)
export const useSettingsProviderDefault = () => useThreadWorkspaceStore(state => state.settingsDraft.providerDefault)
export const useSettingsOpenaiBaseUrl = () => useThreadWorkspaceStore(state => state.settingsDraft.openaiBaseUrl)
export const useSettingsDefaultModel = () => useThreadWorkspaceStore(state => state.settingsDraft.defaultModel)
export const useSettingsModelsText = () => useThreadWorkspaceStore(state => state.settingsDraft.modelsText)
export const useSettingsApiKeyInput = () => useThreadWorkspaceStore(state => state.settingsDraft.apiKeyInput)
export const useHasOpenAiApiKey = () => useThreadWorkspaceStore(state => state.settingsRuntime.hasOpenAiApiKey)
export const useSettingsLoading = () => useThreadWorkspaceStore(state => state.settingsRuntime.isLoading)
export const useSettingsSaving = () => useThreadWorkspaceStore(state => state.settingsRuntime.isSaving)
export const useSettingsError = () => useThreadWorkspaceStore(state => state.settingsRuntime.error)
