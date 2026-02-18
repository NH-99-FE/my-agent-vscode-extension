import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type OptionSelectItem = {
  value: string
  label: string
  icon: LucideIcon
  disabled?: boolean
}

type OptionSelectProps = {
  /** 下拉可选项列表。 */
  options: OptionSelectItem[]
  /** 下拉面板标题。 */
  title: string
  /** 触发器 hover 提示文案。 */
  hoverTip: string
  /** 是否在下拉项内显示图标。 */
  showItemIcon?: boolean
  /** 默认选中项。 */
  defaultValue?: string
  /** 受控选中值。 */
  value?: string
  /** 选中值变化回调。 */
  onChange?: (value: string) => void
}

export function OptionSelect({
  options,
  title,
  hoverTip,
  showItemIcon = true,
  defaultValue,
  value: controlledValue,
  onChange,
}: OptionSelectProps) {
  const initialValue = defaultValue ?? options[0]?.value ?? ''
  const [uncontrolledValue, setUncontrolledValue] = React.useState(initialValue)
  const [selectOpen, setSelectOpen] = React.useState(false)
  const [tooltipOpen, setTooltipOpen] = React.useState(false)
  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : uncontrolledValue

  React.useEffect(() => {
    if (!isControlled) {
      setUncontrolledValue(initialValue)
    }
  }, [initialValue, isControlled])

  const selected = options.find(option => option.value === value)

  return (
    <Select
      value={value}
      onOpenChange={open => {
        setSelectOpen(open)
        // 下拉打开时立即关闭 tooltip，避免两层浮层重叠。
        if (open) {
          setTooltipOpen(false)
        }
      }}
      onValueChange={next => {
        if (!isControlled) {
          setUncontrolledValue(next)
        }
        // 将新值抛给父组件（例如写入配置或触发请求）。
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
              className="h-8 rounded-full border-0 bg-transparent px-2 text-muted-foreground shadow-none transition-colors hover:bg-muted focus-visible:ring-0 data-[state=open]:bg-muted"
            >
              <span className="inline-flex items-center md:hidden">{selected ? <selected.icon className="h-4 w-4" /> : null}</span>
              <span className="hidden text-xs md:inline">{selected?.label ?? title}</span>
            </SelectTrigger>
          </div>
        </TooltipTrigger>
        <TooltipContent
          sideOffset={2}
          className="pointer-events-none border border-border bg-popover text-popover-foreground shadow-xs dark:border-[#3a3a3a]"
        >
          <p>{hoverTip}</p>
        </TooltipContent>
      </Tooltip>

      <SelectContent
        position="popper"
        align="start"
        className="shadow-x min-w-40 rounded-xl border-border/50 bg-popover text-foreground dark:border-[#3a3a3a]"
      >
        <SelectGroup>
          <SelectLabel className="px-2 py-1.5 text-xs text-muted-foreground">{title}</SelectLabel>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled ?? false} className="rounded-md text-xs">
              {showItemIcon && <option.icon className="h-4 w-4" />}
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
