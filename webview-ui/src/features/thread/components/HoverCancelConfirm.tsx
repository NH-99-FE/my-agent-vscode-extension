import clsx from 'clsx'
import { useState, type ReactNode } from 'react'

/**
 * 删除交互组件（图标 -> 确认按钮）。
 * 组件本身只维护视觉 hover 态；确认业务态由父组件受控。
 */
type HoverCancelConfirmProps = {
  /** 未进入确认态时展示的图标（例如 Trash2）。 */
  icon: ReactNode
  /** 确认按钮文案，默认“确认”。 */
  confirmText?: string
  /** 是否处于确认态（由父组件控制）。 */
  confirming: boolean
  /** 点击图标进入确认态时触发（父组件通常设置 confirmingId）。 */
  onEnterConfirm: () => void
  /** 点击“确认”后触发（父组件执行删除并清理确认态）。 */
  onConfirm: () => void
}

export function HoverCancelConfirm({ icon, confirmText = '确认', confirming, onEnterConfirm, onConfirm }: HoverCancelConfirmProps) {
  // 仅用于控制确认按钮 hover 视觉，不参与业务状态。
  const [isConfirmHovered, setIsConfirmHovered] = useState(false)

  return (
    <div className="inline-flex items-center">
      {!confirming ? (
        <button
          type="button"
          aria-label="action"
          className="inline-flex cursor-pointer items-center justify-center rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
          onClick={e => {
            e.stopPropagation()
            onEnterConfirm()
          }}
        >
          {icon}
        </button>
      ) : (
        <button
          type="button"
          className={clsx(
            'inline-flex cursor-pointer items-center justify-center rounded-full px-2 py-1 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-destructive/30 focus-visible:outline-none active:bg-destructive/30',
            isConfirmHovered ? 'bg-destructive/20 text-destructive' : 'bg-destructive/10 text-destructive'
          )}
          onMouseEnter={() => setIsConfirmHovered(true)}
          onMouseLeave={() => setIsConfirmHovered(false)}
          onClick={e => {
            e.stopPropagation()
            onConfirm()
          }}
        >
          {confirmText}
        </button>
      )}
    </div>
  )
}
