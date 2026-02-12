import { ChevronDown, Plus } from 'lucide-react'
import { IconTooltip } from '@/components/common/IconTooltip'
import { ArrowUp } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { useLayoutEffect, useRef, useState } from 'react'

export const Composer = () => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
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

  return (
    <div className="relative mx-3 my-2 flex flex-col rounded-xl bg-gray-200 p-2">
      <Textarea
        ref={textareaRef}
        rows={1}
        onInput={resizeTextarea}
        placeholder="向Codex任意提问"
        className={`max-h-50 min-h-15 ${isOverflowing ? 'overflow-y-auto' : 'overflow-y-hidden'}`}
      />
      <div className="flex items-center justify-start gap-1">
        <IconTooltip tipText="添加文件等">
          <Plus className="h-5 w-5" />
        </IconTooltip>
        <IconTooltip tipText="选择模型">
          <div className="flex items-center gap-0.5 px-1">
            <span className="text-sm">GPT-5.3-Codex</span>
            <ChevronDown className="h-4 w-4" />
          </div>
        </IconTooltip>
        <IconTooltip tipText="选择推理强度等级">
          <div className="flex items-center gap-0.5 px-1">
            <span className="text-sm">中</span>
            <ChevronDown className="h-4 w-4" />
          </div>
        </IconTooltip>
      </div>
      <div className="absolute right-2 bottom-2">
        <IconTooltip tipText="发送消息" hasBackground={true}>
          <div className="rounded-full bg-accent p-1">
            <ArrowUp className="h-6 w-6" />
          </div>
        </IconTooltip>
      </div>
    </div>
  )
}
