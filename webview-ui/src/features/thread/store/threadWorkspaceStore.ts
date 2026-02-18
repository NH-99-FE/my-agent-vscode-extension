import { create } from 'zustand'
import type { ProviderDefault, SettingsStateMessage } from '@agent/types'

// 设置表单草稿数据（用户编辑中的值），与后端同步前存储在此，applySettingsSnapshot 后写入
type SettingsDraft = {
  providerDefault: ProviderDefault // 默认 provider：auto | mock | openai
  openaiBaseUrl: string // OpenAI 兼容服务 Base URL
  defaultModel: string // 默认模型名称
  modelsText: string // 可用模型列表（文本格式，每行一个）
  apiKeyInput: string // API Key 输入框值（敏感，不持久化）
}

// 设置运行时状态（加载/保存状态、错误、密钥存在性）
type SettingsRuntimeState = {
  hasOpenAiApiKey: boolean // 是否已存储 OpenAI API Key
  isLoading: boolean // 是否正在加载设置
  isSaving: boolean // 是否正在保存设置
  error: string | null // 错误信息
}

// 历史记录列表项
export type ThreadHistoryItem = {
  sessionId: string // 会话唯一 ID（与路由 :threadId 一致）
  title: string // 历史列表展示标题（由消息摘要生成）
  updatedAt: number // 最近更新时间戳（毫秒），用于排序与时间文案
}

// 工作区全局状态，管理设置面板、创建会话状态、前端历史记录
type ThreadWorkspaceState = {
  isSettingsOpen: boolean // 设置面板是否打开
  isCreatingSession: boolean // 是否正在创建新会话（用于禁用并发创建）
  threadHistory: ThreadHistoryItem[] // 前端本地历史记录：仅用于 UI 展示，不等价于后端持久化
  settingsDraft: SettingsDraft // 设置表单草稿
  settingsRuntime: SettingsRuntimeState // 设置运行时状态
}

// 工作区操作方法，负责设置面板开关、设置读写、历史记录增删等
type ThreadWorkspaceActions = {
  setSettingsOpen: (open: boolean) => void // 设置面板显隐
  toggleSettingsOpen: () => void // 切换设置面板状态
  beginCreateSession: () => void // 开始创建会话
  finishCreateSession: () => void // 完成创建会话
  beginSettingsLoad: () => void // 开始加载设置（显示 loading）
  beginSettingsSave: () => void // 开始保存设置（显示 saving）
  applySettingsSnapshot: (snapshot: SettingsStateMessage['payload']) => void // 应用后端返回的设置快照（写入 draft + 更新 runtime）
  setSettingsError: (message: string | null) => void // 设置错误信息
  setSettingsProviderDefault: (providerDefault: ProviderDefault) => void // 更新默认 provider
  setSettingsOpenaiBaseUrl: (openaiBaseUrl: string) => void // 更新 OpenAI Base URL
  setSettingsDefaultModel: (defaultModel: string) => void // 更新默认模型
  setSettingsModelsText: (modelsText: string) => void // 更新可用模型列表（文本格式）
  setSettingsApiKeyInput: (apiKeyInput: string) => void // 更新 API Key 输入
  clearSettingsApiKeyInput: () => void // 清空 API Key 输入
  upsertThreadHistory: (item: ThreadHistoryItem) => void // 新增或更新历史项（同 sessionId 去重并刷新排序）
  removeThreadHistory: (sessionId: string) => void // 删除单条历史项
  setThreadHistory: (items: ThreadHistoryItem[]) => void // 全量设置历史项
}

type ThreadWorkspaceStore = ThreadWorkspaceState & { actions: ThreadWorkspaceActions }

// 规范化模型列表（去重、过滤空值）
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

/**
 * 解析模型列表文本（每行一个）去重后返回数组
 * 供设置面板保存时使用
 */
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

const useThreadWorkspaceStore = create<ThreadWorkspaceStore>((set, get) => ({
  // 初始状态
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
    // 设置面板显隐
    setSettingsOpen: open => {
      set({ isSettingsOpen: open })
    },
    // 切换设置面板状态
    toggleSettingsOpen: () => {
      set({ isSettingsOpen: !get().isSettingsOpen })
    },
    // 开始创建会话
    beginCreateSession: () => {
      set({ isCreatingSession: true })
    },
    // 完成创建会话
    finishCreateSession: () => {
      set({ isCreatingSession: false })
    },
    // 开始加载设置（显示 loading）
    beginSettingsLoad: () => {
      set(state => ({
        settingsRuntime: {
          ...state.settingsRuntime,
          isLoading: true,
          error: null,
        },
      }))
    },
    // 开始保存设置（显示 saving）
    beginSettingsSave: () => {
      set(state => ({
        settingsRuntime: {
          ...state.settingsRuntime,
          isSaving: true,
          error: null,
        },
      }))
    },
    /** 应用后端返回的设置快照，后端快照是 settings 的单一可信源，写入后清理 loading/saving */
    applySettingsSnapshot: snapshot => {
      const rawPayload = snapshot as unknown as Record<string, unknown>
      const hasDefaultModelField = Object.prototype.hasOwnProperty.call(rawPayload, 'openaiDefaultModel')
      const hasModelsField = Object.prototype.hasOwnProperty.call(rawPayload, 'openaiModels')

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
    // 设置错误信息（同时结束 loading/saving）
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
    // 更新默认 provider
    setSettingsProviderDefault: providerDefault => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          providerDefault,
        },
      }))
    },
    // 更新 OpenAI Base URL
    setSettingsOpenaiBaseUrl: openaiBaseUrl => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          openaiBaseUrl,
        },
      }))
    },
    // 更新默认模型
    setSettingsDefaultModel: defaultModel => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          defaultModel,
        },
      }))
    },
    // 更新可用模型列表（文本格式）
    setSettingsModelsText: modelsText => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          modelsText,
        },
      }))
    },
    // 更新 API Key 输入
    setSettingsApiKeyInput: apiKeyInput => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          apiKeyInput,
        },
      }))
    },
    // 清空 API Key 输入
    clearSettingsApiKeyInput: () => {
      set(state => ({
        settingsDraft: {
          ...state.settingsDraft,
          apiKeyInput: '',
        },
      }))
    },
    /** 新增或更新历史项，同 sessionId 去重，新项置顶并按时间降序排序 */
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
        // 去重：移除同 sessionId 的旧项
        const deduped = state.threadHistory.filter(historyItem => historyItem.sessionId !== normalizedSessionId)
        // 新项置顶，按时间降序排序
        const nextHistory = [nextItem, ...deduped].sort((a, b) => b.updatedAt - a.updatedAt)
        return {
          threadHistory: nextHistory,
        }
      })
    },
    // 删除单条历史项
    removeThreadHistory: sessionId => {
      const normalizedSessionId = sessionId.trim()
      if (!normalizedSessionId) {
        return
      }
      set(state => ({
        threadHistory: state.threadHistory.filter(item => item.sessionId !== normalizedSessionId),
      }))
    },
    /** 全量设置历史项，用于初始化或全量刷新 */
    setThreadHistory: items => {
      const nextHistory = items
        .map(item => ({
          sessionId: item.sessionId.trim(),
          title: item.title.trim() || '新会话',
          updatedAt: item.updatedAt,
        }))
        .filter(item => item.sessionId)
        .sort((a, b) => b.updatedAt - a.updatedAt)

      set({ threadHistory: nextHistory })
    },
  },
}))

// 导出所有 actions
export const useThreadWorkspaceActions = () => useThreadWorkspaceStore(state => state.actions)
// 设置面板是否打开
export const useIsSettingsOpen = () => useThreadWorkspaceStore(state => state.isSettingsOpen)
// 是否正在创建新会话
export const useIsCreatingSession = () => useThreadWorkspaceStore(state => state.isCreatingSession)
// 历史记录列表
export const useThreadHistoryItems = () => useThreadWorkspaceStore(state => state.threadHistory)
// 默认 provider
export const useSettingsProviderDefault = () => useThreadWorkspaceStore(state => state.settingsDraft.providerDefault)
// OpenAI Base URL
export const useSettingsOpenaiBaseUrl = () => useThreadWorkspaceStore(state => state.settingsDraft.openaiBaseUrl)
// 默认模型
export const useSettingsDefaultModel = () => useThreadWorkspaceStore(state => state.settingsDraft.defaultModel)
// 可用模型列表文本
export const useSettingsModelsText = () => useThreadWorkspaceStore(state => state.settingsDraft.modelsText)
// API Key 输入
export const useSettingsApiKeyInput = () => useThreadWorkspaceStore(state => state.settingsDraft.apiKeyInput)
// 是否已存储 API Key
export const useHasOpenAiApiKey = () => useThreadWorkspaceStore(state => state.settingsRuntime.hasOpenAiApiKey)
// 是否正在加载设置
export const useSettingsLoading = () => useThreadWorkspaceStore(state => state.settingsRuntime.isLoading)
// 是否正在保存设置
export const useSettingsSaving = () => useThreadWorkspaceStore(state => state.settingsRuntime.isSaving)
// 设置错误信息
export const useSettingsError = () => useThreadWorkspaceStore(state => state.settingsRuntime.error)
