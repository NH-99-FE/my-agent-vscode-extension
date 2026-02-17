import { useEffect } from 'react'
import { useThreadSessionActions, useThreadSessionError, useThreadSessionMessages } from '../store/threadSessionStore'
import { cn } from '@/lib/utils'

type ThreadDetailViewProps = {
  threadId: string | undefined
}

export const ThreadDetailView = ({ threadId }: ThreadDetailViewProps) => {
  const messages = useThreadSessionMessages(threadId)
  const sessionError = useThreadSessionError(threadId)
  const { ensureSession, setSessionError } = useThreadSessionActions()

  useEffect(() => {
    if (!threadId || !threadId.trim()) {
      return
    }
    // 路由切换到新会话时，确保会话容器存在并清理旧错误提示。
    ensureSession(threadId)
    setSessionError(threadId, null)
  }, [ensureSession, setSessionError, threadId])

  if (!threadId || !threadId.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-sm text-destructive">无效会话 ID，无法加载详情。</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-2">
      {sessionError ? (
        <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {sessionError}
        </div>
      ) : null}

      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center px-2">
          <p className="text-sm text-muted-foreground">当前会话暂无消息，发送一条消息开始对话。</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map(message => (
            <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[92%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap',
                  message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                )}
              >
                {message.text || (message.status === 'streaming' ? '...' : '')}
                {message.status === 'error' && message.errorMessage ? (
                  <div className="mt-1 text-xs text-destructive">{message.errorMessage}</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
