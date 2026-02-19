import { AlertCircle, LoaderCircle } from 'lucide-react'
import type { ThreadMessageItem } from '@/features/thread/store/threadSessionStore'
import { AssistantMarkdown } from './AssistantMarkdown'

const DEFAULT_ERROR_MESSAGE = '生成失败，请重试。'
const MAX_SHORT_ERROR_LENGTH = 60

type AssistantMessageBlockProps = {
  message: ThreadMessageItem
}

function toShortErrorText(errorMessage: string | undefined): string {
  const normalizedErrorText = errorMessage?.replace(/\s+/g, ' ').trim() ?? ''
  if (!normalizedErrorText) {
    return DEFAULT_ERROR_MESSAGE
  }
  if (normalizedErrorText.length <= MAX_SHORT_ERROR_LENGTH) {
    return normalizedErrorText
  }
  return `${normalizedErrorText.slice(0, MAX_SHORT_ERROR_LENGTH)}...`
}

export function AssistantMessageBlock({ message }: AssistantMessageBlockProps) {
  const isStreaming = message.status === 'streaming'
  const isError = message.status === 'error'
  const shortErrorText = isError ? toShortErrorText(message.errorMessage) : null
  const hideBodyWhenPureError =
    isError &&
    typeof message.errorMessage === 'string' &&
    message.errorMessage.trim().length > 0 &&
    message.text.trim() === message.errorMessage.trim()
  const shouldRenderBodyText = message.text.trim().length > 0 && !hideBodyWhenPureError

  return (
    <div className="mr-auto max-w-full text-foreground">
      {shouldRenderBodyText ? <AssistantMarkdown text={message.text} /> : null}

      {isStreaming ? (
        <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          <span>生成中</span>
        </div>
      ) : null}

      {isError && shortErrorText ? (
        <div className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{shortErrorText}</span>
        </div>
      ) : null}
    </div>
  )
}
