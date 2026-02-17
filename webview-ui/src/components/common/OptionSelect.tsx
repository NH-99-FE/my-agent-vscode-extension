import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type OptionSelect = {
  value: string
  label: string
  icon: LucideIcon
  disabled?: boolean
}

export function OptionSelect({
  options,
  title,
  hoverTip,
  showItemIcon = true,
  defaultValue,
  onChange,
}: {
  options: OptionSelect[]
  title: string
  hoverTip: string
  showItemIcon?: boolean
  defaultValue?: string
  onChange?: (value: string) => void
}) {
  const initial = defaultValue ?? options[0]?.value ?? ''
  const [value, setValue] = React.useState(initial)
  const [selectOpen, setSelectOpen] = React.useState(false)
  const [tooltipOpen, setTooltipOpen] = React.useState(false)

  const selected = options.find(option => option.value === value)

  return (
    <Select
      value={value}
      onOpenChange={open => {
        setSelectOpen(open)
        if (open) {
          setTooltipOpen(false)
        }
      }}
      onValueChange={next => {
        setValue(next)
        onChange?.(next)
        setTooltipOpen(false)
      }}
    >
      <Tooltip open={tooltipOpen}>
        <TooltipTrigger asChild>
          <div
            onPointerEnter={() => {
              if (!selectOpen) {
                setTooltipOpen(true)
              }
            }}
            onPointerLeave={() => {
              setTooltipOpen(false)
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-8 rounded-full border-0 bg-transparent px-2 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-0"
            >
              <span className="inline-flex items-center md:hidden">{selected ? <selected.icon className="h-4 w-4" /> : null}</span>
              <span className="hidden md:inline">{selected?.label ?? title}</span>
            </SelectTrigger>
          </div>
        </TooltipTrigger>
        <TooltipContent sideOffset={2} className="pointer-events-none bg-accent text-accent-foreground shadow-xs">
          <p>{hoverTip}</p>
        </TooltipContent>
      </Tooltip>

      <SelectContent position="popper" align="start" className="min-w-40 rounded-xl border-border/50 bg-popover text-foreground shadow-xl">
        <SelectGroup>
          <SelectLabel className="px-2 py-1.5 text-xs text-muted-foreground">{title}</SelectLabel>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled ?? false} className="rounded-md">
              {showItemIcon && <option.icon className="h-4 w-4" />}
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
