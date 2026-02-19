import type { ThreadMessageItem } from '@/features/thread/store/threadSessionStore'
import { MessageCopyButton } from './MessageCopyButton'

type UserMessageBubbleProps = {
  message: ThreadMessageItem
}

export function UserMessageBubble({ message }: UserMessageBubbleProps) {
  return (
    <div className="group ml-auto flex w-fit max-w-[82%] flex-col items-end">
      <div className="w-fit max-w-full rounded-2xl bg-zinc-900 px-3 py-2 text-zinc-100 dark:bg-zinc-800">
        <p className="text-sm wrap-break-word whitespace-pre-wrap">{message.text}</p>
      </div>
      <MessageCopyButton text={message.text} align="right" />
    </div>
  )
}
