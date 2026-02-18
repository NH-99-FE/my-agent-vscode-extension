import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { HoverCancelConfirm } from './HoverCancelConfirm'
import { type ThreadHistoryItem, useThreadWorkspaceActions } from '../store/threadWorkspaceStore'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

type HistorySearchCardProps = {
  /** 历史列表数据（来自 workspace store）。 */
  items: ThreadHistoryItem[]
  /** 选择某条历史时，由外层决定跳转与浮层收起。 */
  onSelectItem: (sessionId: string) => void
  /** 删除某条历史时，由外层决定是否同步后端删除。 */
  onDeleteItem: (sessionId: string) => void
}

export const HistorySearchCard = ({ items, onSelectItem, onDeleteItem }: HistorySearchCardProps) => {
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
                className={cn(
                  'min-h-9 rounded-md transition-colors data-[selected=true]:bg-transparent data-[selected=true]:text-foreground',
                  hoveredId === item.sessionId ? 'bg-muted/85 dark:bg-[#33383f]' : 'bg-transparent'
                )}
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
                  <div className="flex h-6 min-w-16 shrink-0 items-center justify-end">
                    {hoveredId === item.sessionId ? (
                      <HoverCancelConfirm
                        icon={<Trash2 className="h-4 w-4 text-current" />}
                        confirming={confirmingId === item.sessionId}
                        onEnterConfirm={() => setConfirmingId(item.sessionId)}
                        onConfirm={() => {
                          // 二次确认后删除当前项。
                          removeThreadHistory(item.sessionId)
                          onDeleteItem(item.sessionId)
                          setConfirmingId(null)
                        }}
                      />
                    ) : (
                      <span className="inline-flex h-6 items-center text-xs text-muted-foreground">
                        {formatRelativeTime(item.updatedAt)}
                      </span>
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
