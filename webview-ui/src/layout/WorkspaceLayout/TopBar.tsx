import { IconTooltip } from '@/components/common/IconTooltip'
import { History, Settings, Pencil, ArrowLeft } from 'lucide-react'

export const TopBar = ({ mode }: { mode: 'thread' | 'detail' }) => {
  return (
    <div className="flex h-12 w-full items-center justify-between gap-4 overflow-hidden border-b px-4">
      {mode === 'thread' ? (
        <span>任务</span>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0">
            <IconTooltip tipText="返回">
              <ArrowLeft className="h-4 w-4" />
            </IconTooltip>
          </div>
          <span className="min-w-0 flex-1 truncate">你好你好你好你好你好你好你好你好你好你好你好你好</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <IconTooltip tipText="任务历史记录">
          <History className="h-4 w-4" />
        </IconTooltip>
        <IconTooltip tipText="任务设置">
          <Settings className="h-4 w-4" />
        </IconTooltip>
        <IconTooltip tipText="新聊天">
          <Pencil className="h-4 w-4" />
        </IconTooltip>
      </div>
    </div>
  )
}
