import type { ThreadMessageItem } from '@/features/thread/store/threadSessionStore'

type UserMessageBubbleProps = {
  message: ThreadMessageItem
}

export function UserMessageBubble({ message }: UserMessageBubbleProps) {
  return (
    <div className="ml-auto w-fit max-w-[82%] rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900">
      <p className="text-sm wrap-break-word whitespace-pre-wrap">{message.text}</p>
    </div>
  )
}
