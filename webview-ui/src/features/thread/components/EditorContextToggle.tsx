import { IconTooltip } from '@/components/common/IconTooltip'
import { cn } from '@/lib/utils'
import { FolderCode, EyeOff } from 'lucide-react'

type EditorContextToggleProps = {
  enabled: boolean
  label: string
  hasActiveEditor: boolean
  onToggle: () => void
}

export const EditorContextToggle = ({ enabled, label, hasActiveEditor, onToggle }: EditorContextToggleProps) => {
  const Icon = enabled ? FolderCode : EyeOff
  const tipText = enabled ? '已启用编辑器上下文' : '已禁用编辑器上下文'

  return (
    <IconTooltip tipText={tipText}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={enabled ? 'Disable current editor context' : 'Enable current editor context'}
        className="inline-flex h-6 max-w-28 cursor-pointer items-center gap-1 rounded-md px-1 text-muted-foreground transition-colors hover:bg-muted xl:max-w-45"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className={cn('truncate text-xs', !hasActiveEditor && 'text-muted-foreground/70')}>{label}</span>
      </button>
    </IconTooltip>
  )
}
