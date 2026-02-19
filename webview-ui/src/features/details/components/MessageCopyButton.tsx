import { Check, Copy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { IconTooltip } from '@/components/common/IconTooltip'
import { cn } from '@/lib/utils'
import { copyText } from '../utils/copyText'

const COPIED_FEEDBACK_DURATION_MS = 1500

type MessageCopyButtonProps = {
  text: string
  align: 'left' | 'right'
  className?: string
}

export function MessageCopyButton({ text, align, className }: MessageCopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const copiedTimeoutRef = useRef<number | null>(null)
  const canCopy = text.trim().length > 0

  const clearCopiedTimeout = useCallback(() => {
    if (copiedTimeoutRef.current !== null) {
      window.clearTimeout(copiedTimeoutRef.current)
      copiedTimeoutRef.current = null
    }
  }, [])

  const handleCopy = useCallback(async () => {
    if (!canCopy) {
      return
    }

    const success = await copyText(text)
    if (!success) {
      return
    }

    setCopied(true)
    clearCopiedTimeout()
    copiedTimeoutRef.current = window.setTimeout(() => {
      setCopied(false)
      copiedTimeoutRef.current = null
    }, COPIED_FEEDBACK_DURATION_MS)
  }, [canCopy, clearCopiedTimeout, text])

  useEffect(() => {
    return () => {
      clearCopiedTimeout()
    }
  }, [clearCopiedTimeout])

  return (
    <div
      className={cn(
        'pointer-events-none mt-1 flex h-6 items-center opacity-0 transition-opacity duration-150 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100',
        align === 'right' ? 'justify-end' : 'justify-start',
        className
      )}
    >
      <IconTooltip tipText={canCopy ? (copied ? '已复制' : '复制') : '无可复制内容'}>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!canCopy}
          aria-label={copied ? '已复制' : '复制消息'}
          className={cn(
            'inline-flex items-center rounded-md text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
            copied ? 'gap-1' : 'gap-0'
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </IconTooltip>
    </div>
  )
}
