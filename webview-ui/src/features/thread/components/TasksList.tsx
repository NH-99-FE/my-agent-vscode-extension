import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { HoverCancelConfirm } from './HoverCancelConfirm'

type TaskItem = {
  id: string
  content: string
  time: string
}
type TaskListProps = {
  tasks: TaskItem[]
  /** 点击“查看全部”回调，由父组件决定展示历史搜索卡片。 */
  onViewAllClick?: () => void
}

export const TaskList = ({ tasks, onViewAllClick }: TaskListProps) => {
  // 当前鼠标悬停的任务 id：用于切换右侧显示（time <-> 删除入口）。
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // 当前处于“确认删除”态的任务 id：保证同一时刻只确认一个任务。
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <div className="flex flex-col overflow-hidden">
      {/* tasks列表 */}
      {tasks.map(item => (
        <div
          key={item.id}
          className="group cursor-pointer rounded-lg p-1.5 transition-colors duration-200 hover:bg-muted"
          onMouseEnter={() => setHoveredId(item.id)}
          onMouseLeave={() => {
            setHoveredId(current => (current === item.id ? null : current))
            setConfirmingId(current => (current === item.id ? null : current))
          }}
        >
          <div className="flex h-5 min-w-0 items-center justify-between">
            {/* task内容 */}
            <div className="min-w-0 flex-1 truncate">{item.content}</div>
            {/* 右侧：时间/hover删除 */}
            <div className="flex min-w-16 shrink-0 items-center justify-end">
              {hoveredId === item.id ? (
                <HoverCancelConfirm
                  icon={<Trash2 className="h-4 w-4 cursor-pointer" />}
                  confirming={confirmingId === item.id}
                  onEnterConfirm={() => setConfirmingId(item.id)}
                  onConfirm={() => {
                    // onDelete?.(item.id)
                    setConfirmingId(null)
                  }}
                />
              ) : (
                <span className="text-xs text-muted-foreground">{item.time}</span>
              )}
            </div>
          </div>
        </div>
      ))}
      {/* 底部查看全部 */}
      <span
        onClick={onViewAllClick}
        className="mt-1 cursor-pointer px-1.5 text-sm text-accent-foreground/70 transition-colors duration-200 hover:text-accent-foreground"
      >
        查看全部{'（50个）'}
      </span>
    </div>
  )
}
