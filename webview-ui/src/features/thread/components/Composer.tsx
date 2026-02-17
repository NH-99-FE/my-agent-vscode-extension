import { Bot, BrainCircuit, BrainCog, BrainIcon, Leaf, Plus } from 'lucide-react'
import { IconTooltip } from '@/components/common/IconTooltip'
import { ArrowUp } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { OptionSelect } from '@/components/common/OptionSelect'
import { AddContextFiles, type ContextFileItem } from './AddContextFiles'
import { bridge } from '@/lib/bridge'

const MAX_CONTEXT_FILES = 20

export const Composer = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [contextFiles, setContextFiles] = useState<ContextFileItem[]>([])
  const maxHeight = 200

  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return

    // 先重置高度，这样 textarea 才能随着内容增减而收缩和扩展.
    el.style.height = '0px'
    const nextHeight = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${nextHeight}px`
    setIsOverflowing(el.scrollHeight > maxHeight)
  }

  useLayoutEffect(() => {
    resizeTextarea()
  }, [])

  useEffect(() => {
    const dispose = bridge.onMessage(message => {
      if (message.type === 'context.files.picked') {
        setContextFiles(current => {
          const seenPaths = new Set(current.map(file => file.path))
          const merged = [...current]

          for (const file of message.payload.files) {
            if (seenPaths.has(file.path)) {
              continue
            }
            seenPaths.add(file.path)
            merged.push({
              id: file.path,
              path: file.path,
              name: file.name,
            })
            if (merged.length >= MAX_CONTEXT_FILES) {
              break
            }
          }

          return merged
        })
        return
      }

      // 约定：后续接入发送逻辑后，仅在成功结束时清理上下文文件。
      if (
        message.type === 'chat.done' &&
        (message.payload.finishReason === 'stop' || message.payload.finishReason === 'length')
      ) {
        setContextFiles([])
      }
    })

    return dispose
  }, [])

  const modelOptions = [
    { value: 'gpt-5.3-codex', label: 'GPT-5.3-Codex', icon: Bot },
    { value: 'gpt-4-codex', label: 'GPT-4-Codex', icon: Bot },
    { value: 'gpt-3.5-codex', label: 'GPT-3.5-Codex', icon: Bot },
  ]

  const strengthOptions = [
    { value: 'low', label: '弱', icon: Leaf },
    { value: 'medium', label: '中', icon: BrainIcon },
    { value: 'high', label: '强', icon: BrainCircuit },
    { value: 'ultra', label: '超高', icon: BrainCog },
  ]

  return (
    <div className="relative mx-3 my-2 flex flex-col rounded-xl border border-border bg-card p-2 text-card-foreground shadow-xs">
      <AddContextFiles
        files={contextFiles}
        onRemove={id => {
          setContextFiles(current => current.filter(file => file.id !== id))
        }}
      />
      <Textarea
        ref={textareaRef}
        rows={1}
        onInput={resizeTextarea}
        placeholder="向Codex任意提问"
        className={`max-h-50 min-h-15 ${isOverflowing ? 'overflow-y-auto' : 'overflow-y-hidden'}`}
      />
      <div className="flex items-center justify-start gap-1">
        <IconTooltip tipText="添加文件等">
          <Plus
            className="h-5 w-5 cursor-pointer"
            onClick={() => {
              const remaining = MAX_CONTEXT_FILES - contextFiles.length
              if (remaining <= 0) {
                return
              }

              bridge.send({
                type: 'context.files.pick',
                payload: {
                  maxCount: remaining,
                },
              })
            }}
          />
        </IconTooltip>
        <OptionSelect
          title="选择模型"
          hoverTip="选择模型"
          options={modelOptions}
          showItemIcon={false}
          onChange={value => console.log('Selected model:', value)}
        />
        <OptionSelect
          title="选择推理功能"
          hoverTip="选择推理强度等级"
          options={strengthOptions}
          onChange={value => console.log('Selected strength:', value)}
        />
      </div>
      <div className="absolute right-2 bottom-2">
        <IconTooltip tipText="发送消息" hasBackground={true}>
          <div className="rounded-full bg-primary p-1 text-primary-foreground transition-colors duration-150 hover:bg-primary/90">
            <ArrowUp className="h-6 w-6" />
          </div>
        </IconTooltip>
      </div>
    </div>
  )
}
