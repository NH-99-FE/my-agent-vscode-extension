import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import clsx from 'clsx'

export const IconTooltip = ({
  children,
  tipText,
  hasBackground = false,
}: {
  children: React.ReactNode
  tipText: string
  hasBackground?: boolean
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={clsx(
            'inline-flex cursor-pointer items-center justify-center rounded-full bg-transparent transition-colors duration-150 hover:bg-muted',
            hasBackground ? 'p-0' : 'p-1'
          )}
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent sideOffset={2} className="pointer-events-none border-border bg-accent text-accent-foreground shadow-xs">
        <p>{tipText}</p>
      </TooltipContent>
    </Tooltip>
  )
}
