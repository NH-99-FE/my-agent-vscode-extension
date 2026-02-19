import { memo } from 'react'
import type { ThreadMessageItem } from '@/features/thread/store/threadSessionStore'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

type ThreadMessageRowProps = {
  message: ThreadMessageItem
}

function ThreadMessageRowImpl({ message }: ThreadMessageRowProps) {
  const isUser = message.role === 'user'
  const showStreamingBadge = message.status === 'streaming'
  const showErrorBadge = message.status === 'error'
  const messageText = message.text || (showStreamingBadge ? '...' : '')

  return (
    <div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
      <Card
        className={cn(
          'max-w-[92%] gap-2 rounded-lg border px-3 py-2 shadow-none',
          isUser
            ? 'border-zinc-800 bg-zinc-900 text-zinc-100 dark:border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900'
            : 'bg-card text-card-foreground'
        )}
      >
        <div className="flex items-center gap-2">
          {showStreamingBadge ? (
            <Badge variant="outline" className="border-zinc-400 text-[10px] text-zinc-600 dark:text-zinc-300">
              streaming
            </Badge>
          ) : null}
          {showErrorBadge ? (
            <Badge variant="destructive" className="text-[10px]">
              error
            </Badge>
          ) : null}
        </div>

        <p className="text-sm break-words whitespace-pre-wrap">{messageText}</p>

        {showErrorBadge && message.errorMessage ? (
          <>
            <Separator />
            <p className="text-xs whitespace-pre-wrap text-destructive">{message.errorMessage}</p>
          </>
        ) : null}
      </Card>
    </div>
  )
}

export const ThreadMessageRow = memo(ThreadMessageRowImpl, (prevProps, nextProps) => prevProps.message === nextProps.message)
