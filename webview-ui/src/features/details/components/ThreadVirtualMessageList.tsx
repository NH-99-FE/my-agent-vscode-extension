import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { ThreadMessageItem } from '@/features/thread/store/threadSessionStore'
import { ThreadMessageRow } from './ThreadMessageRow'

const DEFAULT_ESTIMATED_ROW_HEIGHT = 96

type ThreadVirtualMessageListProps = {
  messages: ThreadMessageItem[]
  onBottomStateChange: (isNearBottom: boolean) => void
  onJumpToLatestReady?: (jumpToLatest: (() => void) | null) => void
  nearBottomThreshold?: number
  overscan?: number
}

export function ThreadVirtualMessageList({
  messages,
  onBottomStateChange,
  onJumpToLatestReady,
  nearBottomThreshold = 64,
  overscan = 8,
}: ThreadVirtualMessageListProps) {
  const scrollElementRef = useRef<HTMLDivElement | null>(null)
  const nearBottomRef = useRef<boolean | null>(null)

  const getScrollElement = useCallback(() => scrollElementRef.current, [])

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement,
    estimateSize: () => DEFAULT_ESTIMATED_ROW_HEIGHT,
    getItemKey: index => messages[index]?.id ?? index,
    overscan,
    measureElement: element => element.getBoundingClientRect().height,
  })
  const measureVirtualItemElement = useCallback(
    (element: HTMLDivElement | null) => {
      virtualizer.measureElement(element)
    },
    [virtualizer]
  )
  const emitNearBottom = useCallback(
    (nextNearBottom: boolean) => {
      if (nearBottomRef.current === nextNearBottom) {
        return
      }
      nearBottomRef.current = nextNearBottom
      onBottomStateChange(nextNearBottom)
    },
    [onBottomStateChange]
  )

  const measureNearBottom = useCallback((): void => {
    const element = scrollElementRef.current
    if (!element) {
      return
    }
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    const nextNearBottom = distanceToBottom <= nearBottomThreshold
    emitNearBottom(nextNearBottom)
  }, [emitNearBottom, nearBottomThreshold])

  useLayoutEffect(() => {
    const element = scrollElementRef.current
    if (!element) {
      return
    }

    const onScroll = () => {
      measureNearBottom()
    }

    element.addEventListener('scroll', onScroll, { passive: true })
    measureNearBottom()
    return () => {
      element.removeEventListener('scroll', onScroll)
    }
  }, [measureNearBottom])

  const lastMessageSignature = useMemo(() => {
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) {
      return 'empty'
    }
    return `${lastMessage.id}:${lastMessage.status}:${lastMessage.text.length}`
  }, [messages])

  useEffect(() => {
    measureNearBottom()
  }, [lastMessageSignature, measureNearBottom])

  const jumpToLatest = useCallback(() => {
    if (messages.length === 0) {
      return
    }
    virtualizer.scrollToIndex(messages.length - 1, {
      align: 'end',
    })
    requestAnimationFrame(() => {
      measureNearBottom()
    })
  }, [measureNearBottom, messages.length, virtualizer])

  useEffect(() => {
    if (!onJumpToLatestReady) {
      return
    }
    onJumpToLatestReady(jumpToLatest)
    return () => {
      onJumpToLatestReady(null)
    }
  }, [jumpToLatest, onJumpToLatestReady])

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div ref={scrollElementRef} className="h-full overflow-y-auto px-3 py-2">
      <div
        className="relative w-full"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualItems.map(item => {
          const message = messages[item.index]
          if (!message) {
            return null
          }

          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={measureVirtualItemElement}
              className="absolute top-0 left-0 w-full py-1"
              style={{
                transform: `translateY(${item.start}px)`,
              }}
            >
              <ThreadMessageRow message={message} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
