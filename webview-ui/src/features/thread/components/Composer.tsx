import type { ReasoningLevel } from '@agent/types'
import { ArrowUp, Box, BrainCircuit, BrainCog, BrainIcon, Leaf, Plus } from 'lucide-react'
import { IconTooltip } from '@/components/common/IconTooltip'
import { Textarea } from '@/components/ui/textarea'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OptionSelect } from '@/components/common/OptionSelect'
import { AddContextFiles, type ContextFileItem } from './AddContextFiles'
import { EditorContextToggle } from './EditorContextToggle'
import { bridge } from '@/lib/bridge'
import { useNavigate } from 'react-router'
import {
  buildChatCancelMessage,
  buildChatSendMessage,
  buildContextFilesPickMessage,
  getContextFilesLimitNotice,
  getContextFilesRemaining,
  handleThreadExtensionMessage,
} from '../services/threadMessageService'
import { handleThreadSessionMessage, setThreadSessionDeltaBuffer } from '../services/threadSessionService'
import { createStreamDeltaBuffer } from '../services/streamDeltaBuffer'
import { useEditorContextSubscription } from '../hooks/useEditorContextSubscription'
import {
  useThreadComposerActions,
  useThreadComposerAttachments,
  useThreadComposerCanSend,
  useThreadComposerIncludeActiveEditorContext,
  useThreadComposerIsSending,
  useThreadComposerModel,
  useThreadComposerReasoningLevel,
  useThreadComposerSessionId,
  useThreadComposerText,
} from '../store/threadComposerStore'
import { useEditorContextHasActiveEditor, useEditorContextLabel } from '../store/threadEditorContextStore'
import { parseModelsText, useSettingsDefaultModel, useSettingsModelsText } from '../store/threadWorkspaceStore'
import { useThreadSessionActions } from '../store/threadSessionStore'
import { cn } from '@/lib/utils'

const strengthOptions: Array<{ value: ReasoningLevel; label: string; icon: typeof Leaf }> = [
  { value: 'low', label: '弱', icon: Leaf },
  { value: 'medium', label: '中', icon: BrainIcon },
  { value: 'high', label: '强', icon: BrainCircuit },
  { value: 'xhigh', label: '超高', icon: BrainCog },
]

const reasoningLevelSet = new Set<ReasoningLevel>(['low', 'medium', 'high', 'xhigh'])

function isReasoningLevel(value: string): value is ReasoningLevel {
  return reasoningLevelSet.has(value as ReasoningLevel)
}

type ComposerProps = {
  routeThreadId: string | undefined
}

export const Composer = ({ routeThreadId }: ComposerProps) => {
  const navigate = useNavigate()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const sessionId = useThreadComposerSessionId()
  const text = useThreadComposerText()
  const model = useThreadComposerModel()
  const reasoningLevel = useThreadComposerReasoningLevel()
  const attachments = useThreadComposerAttachments()
  const includeActiveEditorContext = useThreadComposerIncludeActiveEditorContext()
  const editorContextLabel = useEditorContextLabel()
  const editorHasActiveEditor = useEditorContextHasActiveEditor()
  const settingsDefaultModel = useSettingsDefaultModel()
  const settingsModelsText = useSettingsModelsText()
  const settingsModelOptions = useMemo(() => {
    const models = parseModelsText(settingsModelsText)
    if (models.length > 0) {
      return models
    }
    const fallback = settingsDefaultModel.trim()
    return fallback ? [fallback] : []
  }, [settingsDefaultModel, settingsModelsText])
  const canSend = useThreadComposerCanSend()
  const isSending = useThreadComposerIsSending()
  const {
    initSession,
    setText,
    setModel,
    setReasoningLevel,
    setIncludeActiveEditorContext,
    addPickedFiles,
    markPendingContextPick,
    consumePendingContextPickSession,
    removeAttachment,
    clearAttachments,
    setSending,
    setInlineNotice,
  } = useThreadComposerActions()
  const {
    appendUserMessage,
    appendAssistantDelta,
    appendAssistantDeltaBatch,
    completeAssistantMessage,
    setAssistantError,
    beginAssistantRequest,
    getActiveAssistantRequestId,
    isActiveAssistantRequest,
    endAssistantRequest,
    setSessionProtocolError,
  } = useThreadSessionActions()

  const contextFiles: ContextFileItem[] = attachments.map(file => ({
    id: file.path,
    path: file.path,
    name: file.name,
  }))
  const remainingContextFiles = getContextFilesRemaining(attachments.length)
  const maxHeight = 200
  const modelOptions = useMemo(
    () =>
      settingsModelOptions.map(modelId => ({
        value: modelId,
        label: modelId,
        icon: Box,
      })),
    [settingsModelOptions]
  )
  const streamDeltaBuffer = useMemo(
    () =>
      createStreamDeltaBuffer({
        appendAssistantDeltaBatch,
      }),
    [appendAssistantDeltaBatch]
  )

  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return

    // 先重置高度，这样 textarea 才能随着内容增减而收缩和扩展。
    el.style.height = '0px'
    const nextHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${nextHeight}px`
    setIsOverflowing(el.scrollHeight > maxHeight)
  }

  useLayoutEffect(() => {
    resizeTextarea()
  }, [text])

  useEditorContextSubscription()

  useEffect(() => {
    initSession(routeThreadId)
  }, [initSession, routeThreadId])

  useEffect(() => {
    setThreadSessionDeltaBuffer(streamDeltaBuffer)
    const dispose = bridge.onMessage(message => {
      handleThreadSessionMessage(message, {
        appendAssistantDelta,
        completeAssistantMessage,
        setAssistantError,
        isActiveAssistantRequest,
        setSessionProtocolError,
      })
      handleThreadExtensionMessage(message, {
        addPickedFiles,
        consumePendingContextPickSession,
        clearAttachments,
        setSending,
        setInlineNotice,
        getActiveAssistantRequestId,
        isActiveAssistantRequest,
        endAssistantRequest,
      })
    })

    return () => {
      dispose()
      streamDeltaBuffer.dispose()
      setThreadSessionDeltaBuffer(null)
    }
  }, [
    addPickedFiles,
    appendAssistantDelta,
    endAssistantRequest,
    getActiveAssistantRequestId,
    isActiveAssistantRequest,
    clearAttachments,
    completeAssistantMessage,
    consumePendingContextPickSession,
    setAssistantError,
    setInlineNotice,
    setSessionProtocolError,
    setSending,
    streamDeltaBuffer,
  ])

  useEffect(() => {
    if (settingsModelOptions.length === 0) {
      if (model) {
        setModel('')
      }
      return
    }
    if (!settingsModelOptions.includes(model)) {
      const fallbackModel = settingsModelOptions[0]
      if (fallbackModel) {
        setModel(fallbackModel)
      }
    }
  }, [model, sessionId, setModel, settingsModelOptions])

  const handlePickContextFiles = () => {
    // 附件已满时不再发 pick 请求，直接展示统一提示。
    if (remainingContextFiles <= 0) {
      setInlineNotice(getContextFilesLimitNotice())
      return
    }
    setInlineNotice(null)
    const pickRequestId = crypto.randomUUID()
    markPendingContextPick(pickRequestId, sessionId)
    bridge.send(buildContextFilesPickMessage(remainingContextFiles, pickRequestId))
  }

  const handleSend = () => {
    // 兜底保护：UI 已禁用按钮，这里再做一次逻辑防守。
    if (!canSend) {
      if (!model.trim()) {
        setInlineNotice('请先在设置中配置默认模型')
      }
      return
    }
    const requestId = crypto.randomUUID()
    setInlineNotice(null)
    beginAssistantRequest(sessionId, requestId)
    setSending(sessionId, true)
    appendUserMessage(sessionId, text)
    bridge.send(
      buildChatSendMessage({
        requestId,
        sessionId,
        text,
        model,
        reasoningLevel,
        attachments,
        includeActiveEditorContext,
      })
    )
    // 发送成功发起后立即清空输入框，避免旧草稿残留在输入区。
    setText('')
    // 在首页直接发送时，切换到该会话详情页，便于承接后续流式消息展示。
    if (!routeThreadId && sessionId.trim()) {
      navigate(`/${sessionId}`)
    }
  }

  const handlePause = () => {
    setSending(sessionId, false)
    const activeRequestId = getActiveAssistantRequestId(sessionId)
    bridge.send(buildChatCancelMessage(sessionId, activeRequestId))
  }

  return (
    <div className="relative mx-3 my-2 flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-xs">
      <AddContextFiles
        files={contextFiles}
        onRemove={id => {
          removeAttachment(id)
        }}
      />
      <Textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onInput={resizeTextarea}
        onChange={event => {
          setText(event.target.value)
        }}
        placeholder="向Codex任意提问"
        className={`max-h-50 min-h-15 ${isOverflowing ? 'overflow-y-auto' : 'overflow-y-hidden'}`}
      />
      <div className="flex items-center justify-start gap-1">
        <IconTooltip tipText="添加文件等">
          <button
            type="button"
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
            onClick={handlePickContextFiles}
            aria-label="添加上下文文件"
          >
            <Plus className="h-5 w-5" />
          </button>
        </IconTooltip>
        <EditorContextToggle
          enabled={includeActiveEditorContext}
          label={editorContextLabel}
          hasActiveEditor={editorHasActiveEditor}
          onToggle={() => {
            setIncludeActiveEditorContext(!includeActiveEditorContext)
          }}
        />
        <OptionSelect
          title="选择模型"
          hoverTip="选择模型"
          options={modelOptions}
          showItemIcon={false}
          value={model}
          onChange={value => {
            setModel(value)
          }}
        />
        <OptionSelect
          title="选择推理功能"
          hoverTip="选择推理强度等级"
          options={strengthOptions}
          value={reasoningLevel}
          onChange={value => {
            if (isReasoningLevel(value)) {
              setReasoningLevel(value)
            }
          }}
        />
      </div>
      <div className="absolute right-2 bottom-1.5">
        <IconTooltip tipText={isSending ? '暂停生成' : '发送消息'} hasBackground={true}>
          <button
            type="button"
            onClick={isSending ? handlePause : handleSend}
            disabled={isSending ? false : !canSend}
            aria-label={isSending ? '暂停生成' : '发送消息'}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150',
              isSending
                ? 'cursor-pointer bg-zinc-100 text-zinc-900'
                : canSend
                  ? 'cursor-pointer bg-zinc-100 text-zinc-900'
                  : 'cursor-not-allowed bg-zinc-300 text-zinc-500'
            )}
          >
            {isSending ? <span className="h-2.5 w-2.5 rounded-[2px] bg-current" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </IconTooltip>
      </div>
    </div>
  )
}
