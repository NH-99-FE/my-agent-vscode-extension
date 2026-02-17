import type { ReasoningLevel } from '@agent/types'
import { Bot, BrainCircuit, BrainCog, BrainIcon, Leaf, Plus } from 'lucide-react'
import { IconTooltip } from '@/components/common/IconTooltip'
import { ArrowUp } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { OptionSelect } from '@/components/common/OptionSelect'
import { AddContextFiles, type ContextFileItem } from './AddContextFiles'
import { bridge } from '@/lib/bridge'
import {
  buildChatSendMessage,
  buildContextFilesPickMessage,
  getContextFilesLimitNotice,
  getContextFilesRemaining,
  handleThreadExtensionMessage,
} from '../services/threadMessageService'
import {
  useThreadComposerActions,
  useThreadComposerAttachments,
  useThreadComposerCanSend,
  useThreadComposerInlineNotice,
  useThreadComposerModel,
  useThreadComposerReasoningLevel,
  useThreadComposerSessionId,
  useThreadComposerText,
} from '../store/threadComposerStore'
import { cn } from '@/lib/utils'

const modelOptions = [
  { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex', icon: Bot },
  { value: 'gpt-4-codex', label: 'GPT-4-Codex', icon: Bot },
  { value: 'gpt-3.5-codex', label: 'GPT-3.5-Codex', icon: Bot },
]

const strengthOptions: Array<{ value: ReasoningLevel; label: string; icon: typeof Leaf }> = [
  { value: 'low', label: '弱', icon: Leaf },
  { value: 'medium', label: '中', icon: BrainIcon },
  { value: 'high', label: '强', icon: BrainCircuit },
  { value: 'ultra', label: '超高', icon: BrainCog },
]

const reasoningLevelSet = new Set<ReasoningLevel>(['low', 'medium', 'high', 'ultra'])

function isReasoningLevel(value: string): value is ReasoningLevel {
  return reasoningLevelSet.has(value as ReasoningLevel)
}

type ComposerProps = {
  routeThreadId: string | undefined
}

export const Composer = ({ routeThreadId }: ComposerProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const sessionId = useThreadComposerSessionId()
  const text = useThreadComposerText()
  const model = useThreadComposerModel()
  const reasoningLevel = useThreadComposerReasoningLevel()
  const attachments = useThreadComposerAttachments()
  const inlineNotice = useThreadComposerInlineNotice()
  const canSend = useThreadComposerCanSend()
  const {
    initSession,
    setText,
    setModel,
    setReasoningLevel,
    addPickedFiles,
    markPendingContextPick,
    consumePendingContextPickSession,
    removeAttachment,
    clearAttachments,
    setSending,
    setInlineNotice,
  } = useThreadComposerActions()

  const contextFiles: ContextFileItem[] = attachments.map(file => ({
    id: file.path,
    path: file.path,
    name: file.name,
  }))
  const remainingContextFiles = getContextFilesRemaining(attachments.length)
  const maxHeight = 200

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

  useEffect(() => {
    initSession(routeThreadId)
  }, [initSession, routeThreadId])

  useEffect(() => {
    const dispose = bridge.onMessage(message => {
      handleThreadExtensionMessage(message, {
        addPickedFiles,
        consumePendingContextPickSession,
        clearAttachments,
        setSending,
        setInlineNotice,
      })
    })

    return dispose
  }, [addPickedFiles, clearAttachments, consumePendingContextPickSession, setInlineNotice, setSending])

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
      return
    }
    setInlineNotice(null)
    setSending(sessionId, true)
    bridge.send(
      buildChatSendMessage({
        sessionId,
        text,
        model,
        reasoningLevel,
        attachments,
      }),
    )
  }

  return (
    <div className="relative mx-3 my-2 flex flex-col rounded-xl border border-border bg-card p-2 text-card-foreground shadow-xs">
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
          if (inlineNotice) {
            setInlineNotice(null)
          }
        }}
        placeholder="向Codex任意提问"
        className={`max-h-50 min-h-15 ${isOverflowing ? 'overflow-y-auto' : 'overflow-y-hidden'}`}
      />
      <div className="flex items-center justify-start gap-1">
        <IconTooltip tipText="添加文件等">
          <button
            type="button"
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={handlePickContextFiles}
            aria-label="添加上下文文件"
          >
            <Plus className="h-5 w-5" />
          </button>
        </IconTooltip>
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
      {inlineNotice ? <p className="mt-1 px-1 text-xs text-destructive">{inlineNotice}</p> : null}
      <div className="absolute right-2 bottom-2">
        <IconTooltip tipText="发送消息" hasBackground={true}>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="发送消息"
            className={cn(
              'rounded-full p-1 transition-colors duration-150',
              canSend
                ? 'cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90'
                : 'cursor-not-allowed bg-muted text-muted-foreground',
            )}
          >
            <ArrowUp className="h-6 w-6" />
          </button>
        </IconTooltip>
      </div>
    </div>
  )
}
