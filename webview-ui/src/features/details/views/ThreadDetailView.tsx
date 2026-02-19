import { useCallback, useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useThreadSessionActions,
  useThreadSessionError,
  useThreadSessionHasActiveRequest,
  useThreadSessionMessages,
} from '@/features/thread/store/threadSessionStore'
import { JumpToLatestButton } from '../components/JumpToLatestButton'
import { ThreadVirtualMessageList } from '../components/ThreadVirtualMessageList'

const NEAR_BOTTOM_THRESHOLD = 64
const DEFAULT_OVERSCAN = 8
const MAX_NEAR_BOTTOM_CACHE_SIZE = 80

type ThreadDetailViewProps = {
  threadId: string | undefined
}

export const ThreadDetailView = ({ threadId }: ThreadDetailViewProps) => {
  const normalizedThreadId = threadId?.trim() ?? ''
  const isValidThreadId = normalizedThreadId.length > 0
  const messages = useThreadSessionMessages(normalizedThreadId || undefined)
  const sessionError = useThreadSessionError(normalizedThreadId || undefined)
  const hasActiveRequest = useThreadSessionHasActiveRequest(normalizedThreadId || undefined)
  const { ensureSession, setSessionError } = useThreadSessionActions()
  const [nearBottomByThreadId, setNearBottomByThreadId] = useState<Record<string, boolean | null>>({})
  const jumpToLatestActionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!isValidThreadId) {
      return
    }
    // 路由切换到新会话时，确保会话容器存在并清理旧错误提示。
    ensureSession(normalizedThreadId)
    setSessionError(normalizedThreadId, null)
  }, [ensureSession, isValidThreadId, normalizedThreadId, setSessionError])

  const isNearBottom = isValidThreadId ? (nearBottomByThreadId[normalizedThreadId] ?? null) : null
  const isLoading = messages.length === 0 && !sessionError && hasActiveRequest
  const showJumpToLatest = messages.length > 0 && isNearBottom === false

  const handleBottomStateChange = useCallback(
    (nearBottom: boolean) => {
      setNearBottomByThreadId(state => {
        if (!normalizedThreadId) {
          return state
        }
        if (state[normalizedThreadId] === nearBottom) {
          return state
        }
        const nextState: Record<string, boolean | null> = {
          ...state,
          [normalizedThreadId]: nearBottom,
        }
        if (Object.keys(nextState).length <= MAX_NEAR_BOTTOM_CACHE_SIZE) {
          return nextState
        }

        let nextSize = Object.keys(nextState).length
        for (const key of Object.keys(nextState)) {
          if (nextSize <= MAX_NEAR_BOTTOM_CACHE_SIZE) {
            break
          }
          if (key === normalizedThreadId) {
            continue
          }
          delete nextState[key]
          nextSize -= 1
        }

        return nextState
      })
    },
    [normalizedThreadId]
  )

  const handleJumpToLatestReady = useCallback((jumpToLatest: (() => void) | null) => {
    jumpToLatestActionRef.current = jumpToLatest
  }, [])

  if (!isValidThreadId) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-2">
        <p className="text-sm text-destructive">无效会话 ID，无法加载详情。</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col px-2 py-2">
      {sessionError ? (
        <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {sessionError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="flex flex-1 flex-col gap-2 px-2 py-1">
          <Skeleton className="h-18 w-[72%] rounded-lg" />
          <Skeleton className="ml-auto h-20 w-[84%] rounded-lg" />
          <Skeleton className="h-16 w-[60%] rounded-lg" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-2">
          <p className="text-sm text-muted-foreground">当前会话暂无消息，发送一条消息开始对话。</p>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <ThreadVirtualMessageList
            messages={messages}
            onBottomStateChange={handleBottomStateChange}
            onJumpToLatestReady={handleJumpToLatestReady}
            nearBottomThreshold={NEAR_BOTTOM_THRESHOLD}
            overscan={DEFAULT_OVERSCAN}
          />
          {showJumpToLatest ? (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
              <div className="pointer-events-auto">
                <JumpToLatestButton
                  onClick={() => {
                    jumpToLatestActionRef.current?.()
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
