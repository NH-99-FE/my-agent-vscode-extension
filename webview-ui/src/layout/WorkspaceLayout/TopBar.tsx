import { IconTooltip } from '@/components/common/IconTooltip'
import { History, Settings, Pencil, ArrowLeft } from 'lucide-react'

type TopBarProps = {
  /** 当前页面模式：任务列表或详情页。 */
  mode: 'thread' | 'detail'
  /** 详情页返回按钮点击回调。 */
  onBackClick?: () => void
  /** 点击历史图标时触发（由布局层决定打开/关闭卡片）。 */
  onHistoryClick?: () => void
  /** 点击设置图标时触发。 */
  onSettingsClick?: () => void
  /** 点击新聊天时触发。 */
  onNewChatClick?: () => void
  /** 创建新会话时禁用重复点击。 */
  creatingSession?: boolean
}

export const TopBar = ({ mode, onBackClick, onHistoryClick, onSettingsClick, onNewChatClick, creatingSession = false }: TopBarProps) => {
  return (
    <div className="flex h-8 w-full items-center justify-between gap-4 overflow-hidden px-2.5">
      {mode === 'thread' ? (
        <span className="text-muted-foreground">任务</span>
      ) : (
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0">
            <IconTooltip tipText="返回">
              <button type="button" onClick={onBackClick} aria-label="返回首页" className="inline-flex cursor-pointer items-center">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </IconTooltip>
          </div>
          <span className="min-w-0 flex-1 truncate">你好你好你好你好你好你好你好你好你好你好你好你好</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <IconTooltip tipText="任务历史记录">
          <button type="button" className="inline-flex cursor-pointer items-center" onClick={onHistoryClick} aria-label="任务历史记录">
            <History className="h-4 w-4" />
          </button>
        </IconTooltip>
        <IconTooltip tipText="任务设置">
          <button type="button" className="inline-flex cursor-pointer items-center" onClick={onSettingsClick} aria-label="任务设置">
            <Settings className="h-4 w-4" />
          </button>
        </IconTooltip>
        <IconTooltip tipText={creatingSession ? '正在创建新会话' : '新聊天'}>
          <button
            type="button"
            className="inline-flex cursor-pointer items-center disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onNewChatClick}
            aria-label="新聊天"
            disabled={creatingSession}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </IconTooltip>
      </div>
    </div>
  )
}
