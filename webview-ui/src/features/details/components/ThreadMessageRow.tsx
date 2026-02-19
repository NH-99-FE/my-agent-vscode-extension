import { memo } from 'react'
import type { ThreadMessageItem } from '@/features/thread/store/threadSessionStore'
import { cn } from '@/lib/utils'
import { AssistantMessageBlock } from './AssistantMessageBlock'
import { UserMessageBubble } from './UserMessageBubble'

type ThreadMessageRowProps = {
  message: ThreadMessageItem
}

function ThreadMessageRowImpl({ message }: ThreadMessageRowProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      {isUser ? <UserMessageBubble message={message} /> : <AssistantMessageBlock message={message} />}
    </div>
  )
}

export const ThreadMessageRow = memo(ThreadMessageRowImpl, (prevProps, nextProps) => prevProps.message === nextProps.message)
