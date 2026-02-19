import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

type JumpToLatestButtonProps = {
  onClick: () => void
}

export function JumpToLatestButton({ onClick }: JumpToLatestButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-label="跳到最新消息"
      className="border-zinc-300 bg-card/95 text-zinc-800 shadow-sm hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      <ArrowDown className="h-4 w-4" />
      跳到最新
    </Button>
  )
}
