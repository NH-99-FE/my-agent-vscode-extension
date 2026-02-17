import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { HoverCancelConfirm } from './HoverCancelConfirm'
import { type ThreadHistoryItem, useThreadWorkspaceActions } from '../store/threadWorkspaceStore'

type HistorySearchCardProps = {
  /** 历史列表数据（来自 workspace store）。 */
  items: ThreadHistoryItem[]
  /** 选择某条历史时，由外层决定跳转与浮层收起。 */
  onSelectItem: (sessionId: string) => void
}

function formatRelativeTime(updatedAt: number): string {
  const deltaMs = Date.now() - updatedAt
  if (deltaMs < 60_000) {
    return '刚刚'
  }
  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) {
    return `${minutes} 分钟前`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} 小时前`
  }
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

export const HistorySearchCard = ({ items, onSelectItem }: HistorySearchCardProps) => {
  const { removeThreadHistory } = useThreadWorkspaceActions()
  // 当前悬停项：用于切换右侧“时间/删除入口”。
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // 当前确认删除项：保证同一时刻只确认一条。
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <div className="rounded-2xl border border-border/70 bg-card/95 p-2 text-card-foreground shadow-xl backdrop-blur-md">
      <Command className="bg-transparent">
        <CommandInput placeholder="搜索最近任务" className="text-sm" />
        <CommandList className="max-h-90 overflow-y-auto">
          <CommandEmpty>暂无历史会话</CommandEmpty>
          <CommandGroup heading="本地任务">
            {items.map(item => (
              <CommandItem
                key={item.sessionId}
                value={`${item.title} ${formatRelativeTime(item.updatedAt)}`}
                className="rounded-md px-2 py-2"
                onSelect={() => {
                  onSelectItem(item.sessionId)
                }}
                onMouseEnter={() => setHoveredId(item.sessionId)}
                onMouseLeave={() => {
                  setHoveredId(current => (current === item.sessionId ? null : current))
                  setConfirmingId(current => (current === item.sessionId ? null : current))
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <div className="flex min-w-16 shrink-0 items-center justify-end">
                    {hoveredId === item.sessionId ? (
                      <HoverCancelConfirm
                        icon={<Trash2 className="h-4 w-4 cursor-pointer" />}
                        confirming={confirmingId === item.sessionId}
                        onEnterConfirm={() => setConfirmingId(item.sessionId)}
                        onConfirm={() => {
                          // 二次确认后删除当前项。
                          removeThreadHistory(item.sessionId)
                          setConfirmingId(null)
                        }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(item.updatedAt)}</span>
                    )}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}
