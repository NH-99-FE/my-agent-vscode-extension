import { Outlet, useNavigate, useParams } from 'react-router'
import { TopBar } from './TopBar'
import { Composer } from '@/features/thread/components/Composer'
import { useCallback, useEffect, useRef, useState } from 'react'
import { HistorySearchCard } from '@/features/thread/components/HistorySearchCard'
import { SettingsPanel } from '@/features/thread/components/SettingsPanel'
import { bridge } from '@/lib/bridge'
import {
  buildChatHistoryDeleteMessage,
  buildChatSessionGetMessage,
  buildHistoryTitleFromMessages,
  buildChatHistoryGetMessage,
  buildCreateSessionMessage,
  buildSettingsGetMessage,
  buildSettingsSaveMessage,
  handleThreadWorkspaceMessage,
} from '@/features/thread/services/threadWorkspaceService'
import {
  useHasOpenAiApiKey,
  useIsCreatingSession,
  useIsSettingsOpen,
  useSettingsApiKeyInput,
  useSettingsDefaultModel,
  useSettingsError,
  useSettingsLoading,
  useSettingsModelsText,
  useSettingsOpenaiBaseUrl,
  useSettingsProviderDefault,
  useSettingsSaving,
  parseModelsText,
  useThreadHistoryItems,
  useThreadWorkspaceActions,
} from '@/features/thread/store/threadWorkspaceStore'
import {
  useThreadSessionActions,
  useThreadSessionHasActiveRequest,
  useThreadSessionMessages,
} from '@/features/thread/store/threadSessionStore'

export function WorkspaceLayout() {
  const navigate = useNavigate()
  const { threadId } = useParams()
  const mode = threadId ? 'detail' : 'thread'
  // 统一管理历史搜索卡片显隐，TopBar 和任务列表都复用这一个状态。
  const [historyOpen, setHistoryOpen] = useState(false)
  const isSettingsOpen = useIsSettingsOpen()
  const isCreatingSession = useIsCreatingSession()
  const settingsProviderDefault = useSettingsProviderDefault()
  const settingsOpenaiBaseUrl = useSettingsOpenaiBaseUrl()
  const settingsDefaultModel = useSettingsDefaultModel()
  const settingsModelsText = useSettingsModelsText()
  const settingsApiKeyInput = useSettingsApiKeyInput()
  const historyItems = useThreadHistoryItems()
  const currentThreadMessages = useThreadSessionMessages(threadId)
  const hasActiveThreadRequest = useThreadSessionHasActiveRequest(threadId)
  const hasOpenAiApiKey = useHasOpenAiApiKey()
  const settingsLoading = useSettingsLoading()
  const settingsSaving = useSettingsSaving()
  const settingsError = useSettingsError()
  const settingsRequestOrderRef = useRef(0)
  const settingsRequestIndexByIdRef = useRef(new Map<string, number>())
  const latestAppliedSettingsOrderRef = useRef(0)
  const pendingSessionGetByRequestIdRef = useRef(new Map<string, string>())
  const pendingSessionGetSessionIdsRef = useRef(new Set<string>())
  const {
    setSettingsOpen,
    beginCreateSession,
    finishCreateSession,
    beginSettingsLoad,
    beginSettingsSave,
    applySettingsSnapshot,
    setSettingsError,
    setSettingsProviderDefault,
    setSettingsOpenaiBaseUrl,
    setSettingsDefaultModel,
    setSettingsModelsText,
    setSettingsApiKeyInput,
    clearSettingsApiKeyInput,
    removeThreadHistory,
    upsertThreadHistory,
    setThreadHistory,
  } = useThreadWorkspaceActions()
  const { hydrateSessionFromBackend, setSessionError } = useThreadSessionActions()

  const trackSettingsRequest = useCallback((requestId: string): void => {
    settingsRequestOrderRef.current += 1
    settingsRequestIndexByIdRef.current.set(requestId, settingsRequestOrderRef.current)
  }, [])

  const shouldApplySettingsResponse = useCallback((requestId?: string): boolean => {
    if (!requestId) {
      return true
    }
    const order = settingsRequestIndexByIdRef.current.get(requestId)
    settingsRequestIndexByIdRef.current.delete(requestId)
    if (order === undefined) {
      return true
    }
    if (order < latestAppliedSettingsOrderRef.current) {
      return false
    }
    latestAppliedSettingsOrderRef.current = order
    return true
  }, [])

  const requestSettings = useCallback(() => {
    const requestId = crypto.randomUUID()
    trackSettingsRequest(requestId)
    beginSettingsLoad()
    bridge.send(buildSettingsGetMessage(requestId))
  }, [beginSettingsLoad, trackSettingsRequest])

  const requestHistory = useCallback(() => {
    bridge.send(buildChatHistoryGetMessage(crypto.randomUUID()))
  }, [])

  const requestSessionState = useCallback((sessionId: string) => {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) {
      return
    }
    if (pendingSessionGetSessionIdsRef.current.has(normalizedSessionId)) {
      return
    }
    const requestId = crypto.randomUUID()
    pendingSessionGetByRequestIdRef.current.set(requestId, normalizedSessionId)
    pendingSessionGetSessionIdsRef.current.add(normalizedSessionId)
    bridge.send(buildChatSessionGetMessage(requestId, normalizedSessionId))
  }, [])

  const deleteHistorySession = useCallback(
    (sessionId: string) => {
      const normalizedSessionId = sessionId.trim()
      if (!normalizedSessionId) {
        return
      }
      removeThreadHistory(normalizedSessionId)
      bridge.send(buildChatHistoryDeleteMessage(crypto.randomUUID(), normalizedSessionId))
      if (threadId === normalizedSessionId) {
        navigate('/')
      }
    },
    [navigate, removeThreadHistory, threadId]
  )

  const saveSettings = useCallback(() => {
    const normalizedModels = parseModelsText(settingsModelsText)
    const normalizedDefaultModel = settingsDefaultModel.trim()
    if (!normalizedDefaultModel && normalizedModels.length === 0) {
      setSettingsError('请至少配置默认模型或模型列表')
      return
    }

    const requestId = crypto.randomUUID()
    trackSettingsRequest(requestId)
    beginSettingsSave()
    const normalizedApiKey = settingsApiKeyInput.trim()
    bridge.send(
      buildSettingsSaveMessage(requestId, {
        providerDefault: settingsProviderDefault,
        openaiBaseUrl: settingsOpenaiBaseUrl,
        openaiDefaultModel: normalizedDefaultModel,
        openaiModels: normalizedModels,
        ...(normalizedApiKey ? { openaiApiKey: normalizedApiKey } : {}),
      })
    )
    if (normalizedApiKey) {
      clearSettingsApiKeyInput()
    }
  }, [
    beginSettingsSave,
    clearSettingsApiKeyInput,
    settingsApiKeyInput,
    setSettingsError,
    settingsDefaultModel,
    settingsModelsText,
    settingsOpenaiBaseUrl,
    settingsProviderDefault,
    trackSettingsRequest,
  ])

  const saveApiKey = useCallback(() => {
    const normalizedApiKey = settingsApiKeyInput.trim()
    if (!normalizedApiKey) {
      setSettingsError('API Key 不能为空')
      return
    }
    const requestId = crypto.randomUUID()
    trackSettingsRequest(requestId)
    beginSettingsSave()
    bridge.send(
      buildSettingsSaveMessage(requestId, {
        openaiApiKey: normalizedApiKey,
      })
    )
    clearSettingsApiKeyInput()
  }, [
    beginSettingsSave,
    clearSettingsApiKeyInput,
    setSettingsError,
    settingsApiKeyInput,
    trackSettingsRequest,
  ])

  const deleteApiKey = useCallback(() => {
    const requestId = crypto.randomUUID()
    trackSettingsRequest(requestId)
    beginSettingsSave()
    bridge.send(
      buildSettingsSaveMessage(requestId, {
        deleteOpenAiApiKey: true,
      })
    )
    clearSettingsApiKeyInput()
  }, [beginSettingsSave, clearSettingsApiKeyInput, trackSettingsRequest])

  // 详情页返回：先写入本地历史摘要，再回到首页。
  const handleBackToHomeFromDetail = useCallback(() => {
    if (!threadId || !threadId.trim()) {
      navigate('/')
      return
    }

    // 空会话返回首页时不写入历史，避免连续新建会话产生多条“新会话”记录。
    if (currentThreadMessages.length > 0) {
      const title = buildHistoryTitleFromMessages(currentThreadMessages)
      upsertThreadHistory({
        sessionId: threadId,
        title,
        updatedAt: Date.now(),
      })
    }
    setHistoryOpen(false)
    setSettingsOpen(false)
    navigate('/')
  }, [currentThreadMessages, navigate, setSettingsOpen, threadId, upsertThreadHistory])

  useEffect(() => {
    // 初始化请求设置和历史
    requestSettings()
    requestHistory()

    const dispose = bridge.onMessage(message => {
      handleThreadWorkspaceMessage(message, {
        finishCreateSession,
        onSettingsState: (snapshot, requestId) => {
          if (!shouldApplySettingsResponse(requestId)) {
            return
          }
          applySettingsSnapshot(snapshot)
        },
        onSystemError: (errorMessage, requestId) => {
          if (requestId) {
            const pendingSessionId = pendingSessionGetByRequestIdRef.current.get(requestId)
            if (pendingSessionId) {
              pendingSessionGetByRequestIdRef.current.delete(requestId)
              pendingSessionGetSessionIdsRef.current.delete(pendingSessionId)
              setSessionError(pendingSessionId, errorMessage)
              return
            }
          }
          setSettingsError(errorMessage)
        },
        onSessionCreated: sessionId => {
          navigate(`/${sessionId}`)
        },
        onHistoryList: sessions => {
          setThreadHistory(
            sessions.map(s => ({
              sessionId: s.id,
              title: s.title,
              updatedAt: s.updatedAt,
            }))
          )
        },
        onSessionState: (session, requestId) => {
          const requestedSessionId = requestId ? pendingSessionGetByRequestIdRef.current.get(requestId) : undefined
          if (requestId) {
            pendingSessionGetByRequestIdRef.current.delete(requestId)
          }
          if (requestedSessionId) {
            pendingSessionGetSessionIdsRef.current.delete(requestedSessionId)
          }
          if (session) {
            hydrateSessionFromBackend(session)
            return
          }
          if (requestedSessionId) {
            setSessionError(requestedSessionId, '会话不存在或已删除。')
          }
        },
      })
    })

    return dispose
  }, [
    applySettingsSnapshot,
    finishCreateSession,
    navigate,
    requestHistory,
    requestSettings,
    setSettingsError,
    setThreadHistory,
    shouldApplySettingsResponse,
    hydrateSessionFromBackend,
    setSessionError,
  ])

  useEffect(() => {
    if (!threadId || !threadId.trim()) {
      return
    }
    // 本地已有消息或该会话仍在流式中时，不触发后端恢复，避免覆盖/打断实时链路。
    if (currentThreadMessages.length > 0 || hasActiveThreadRequest) {
      return
    }
    requestSessionState(threadId)
  }, [currentThreadMessages.length, hasActiveThreadRequest, requestSessionState, threadId])

  // 计算当前会话标题
  const currentSessionTitle = threadId ? (historyItems.find(item => item.sessionId === threadId)?.title ?? '新会话') : ''

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        mode={mode}
        title={currentSessionTitle}
        onBackClick={handleBackToHomeFromDetail}
        creatingSession={isCreatingSession}
        onHistoryClick={() => {
          setSettingsOpen(false)
          setHistoryOpen(current => !current)
        }}
        onSettingsClick={() => {
          const nextOpen = !isSettingsOpen
          setSettingsOpen(nextOpen)
          setHistoryOpen(false)
          if (nextOpen) {
            requestSettings()
          }
        }}
        onNewChatClick={() => {
          beginCreateSession()
          bridge.send(buildCreateSessionMessage(crypto.randomUUID()))
        }}
      />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <Outlet
          context={{
            // 通过 Outlet context 暴露给 ThreadView，用于“查看全部”直接打开卡片。
            openHistoryCard: () => setHistoryOpen(true),
            // 复用同一删除链路，保证首页任务列表与历史卡片行为一致。
            deleteHistorySession,
          }}
        />
        {historyOpen ? (
          <>
            <div className="absolute inset-0 z-20" onClick={() => setHistoryOpen(false)} />
            <div className="absolute inset-x-2 top-1 z-30">
              <HistorySearchCard
                items={historyItems}
                onSelectItem={sessionId => {
                  setHistoryOpen(false)
                  setSettingsOpen(false)
                  navigate(`/${sessionId}`)
                }}
                onDeleteItem={deleteHistorySession}
              />
            </div>
          </>
        ) : null}
        {isSettingsOpen ? (
          <>
            <div className="absolute inset-0 z-20" onClick={() => setSettingsOpen(false)} />
            <div className="absolute top-1 right-2 z-30 w-[22rem] max-w-[calc(100%-1rem)]">
              <SettingsPanel
                providerDefault={settingsProviderDefault}
                openaiBaseUrl={settingsOpenaiBaseUrl}
                defaultModel={settingsDefaultModel}
                modelsText={settingsModelsText}
                apiKeyInput={settingsApiKeyInput}
                hasOpenAiApiKey={hasOpenAiApiKey}
                loading={settingsLoading}
                saving={settingsSaving}
                error={settingsError}
                onProviderDefaultChange={value => {
                  setSettingsProviderDefault(value)
                  setSettingsError(null)
                }}
                onOpenaiBaseUrlChange={value => {
                  setSettingsOpenaiBaseUrl(value)
                  setSettingsError(null)
                }}
                onDefaultModelChange={value => {
                  setSettingsDefaultModel(value)
                  setSettingsError(null)
                }}
                onModelsTextChange={value => {
                  setSettingsModelsText(value)
                  setSettingsError(null)
                }}
                onApiKeyInputChange={value => {
                  setSettingsApiKeyInput(value)
                  setSettingsError(null)
                }}
                onRefresh={requestSettings}
                onSaveSettings={saveSettings}
                onSaveApiKey={saveApiKey}
                onDeleteApiKey={deleteApiKey}
                onClose={() => setSettingsOpen(false)}
              />
            </div>
          </>
        ) : null}
      </main>
      <Composer routeThreadId={threadId} />
    </div>
  )
}
