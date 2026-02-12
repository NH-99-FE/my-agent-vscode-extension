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
            'cursor-pointer rounded-full bg-transparent transition-colors duration-150 hover:bg-muted',
            hasBackground ? 'p-0' : 'p-1'
          )}
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tipText}</p>
      </TooltipContent>
    </Tooltip>
  )
}
