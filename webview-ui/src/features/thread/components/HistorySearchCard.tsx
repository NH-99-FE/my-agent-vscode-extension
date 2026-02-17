import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { HoverCancelConfirm } from './HoverCancelConfirm'

type HistoryItem = {
  id: string
  title: string
  time: string
}

const historyItems: HistoryItem[] = [
  { id: '1', title: '将图标提示移入选择框里', time: '4 小时' },
  { id: '2', title: '我刚才安装了新的windows 终端E:\\APPS\\terminal...', time: '5 小时' },
  { id: '3', title: '这个项目调试的时候如何启动在宿主里面', time: '7 小时' },
  { id: '4', title: 'Explain MessageInput component', time: '4 天' },
  { id: '5', title: '分析下为什么TopBar不随宽度变化而变化', time: '4 天' },
  { id: '6', title: '我的lock有问题，重新生成咋弄', time: '5 天' },
  { id: '7', title: '帮我把pnpm源在这个项目配置为淘宝镜像源', time: '5 天' },
  { id: '8', title: '当前仓库代码手动保存为什么没有自动格式化', time: '6 天' },
  { id: '9', title: '将图标提示移入选择框里', time: '4 小时' },
  { id: '10', title: '我刚才安装了新的windows 终端E:\\APPS\\terminal...', time: '5 小时' },
  { id: '11', title: '这个项目调试的时候如何启动在宿主里面', time: '7 小时' },
  { id: '12', title: 'Explain MessageInput component', time: '4 天' },
  { id: '13', title: '分析下为什么TopBar不随宽度变化而变化', time: '4 天' },
  { id: '14', title: '我的lock有问题，重新生成咋弄', time: '5 天' },
  { id: '15', title: '帮我把pnpm源在这个项目配置为淘宝镜像源', time: '5 天' },
  { id: '16', title: '当前仓库代码手动保存为什么没有自动格式化', time: '6 天' },
]

export const HistorySearchCard = () => {
  // 当前展示的历史项（删除确认后会从该列表移除）。
  const [items, setItems] = useState(historyItems)
  // 当前悬停项：用于切换右侧“时间/删除入口”。
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // 当前确认删除项：保证同一时刻只确认一条。
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <div className="rounded-2xl border border-border/70 bg-card/95 p-2 text-card-foreground shadow-xl backdrop-blur-md">
      <Command className="bg-transparent">
        <CommandInput placeholder="搜索最近任务" className="text-sm" />
        <CommandList className="max-h-90 overflow-y-auto">
          <CommandGroup heading="本地任务">
            {items.map(item => (
              <CommandItem
                key={item.id}
                value={`${item.title} ${item.time}`}
                className="rounded-md px-2 py-2"
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => {
                  setHoveredId(current => (current === item.id ? null : current))
                  setConfirmingId(current => (current === item.id ? null : current))
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <div className="flex min-w-16 shrink-0 items-center justify-end">
                    {hoveredId === item.id ? (
                      <HoverCancelConfirm
                        icon={<Trash2 className="h-4 w-4 cursor-pointer" />}
                        confirming={confirmingId === item.id}
                        onEnterConfirm={() => setConfirmingId(item.id)}
                        onConfirm={() => {
                          // 二次确认后删除当前项。
                          setItems(current => current.filter(currentItem => currentItem.id !== item.id))
                          setConfirmingId(null)
                        }}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">{item.time}</span>
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
