import { TooltipProvider } from '@/components/ui/tooltip'
import { Outlet } from 'react-router'

export function RootLayout() {
  return (
    <div className="h-dvh bg-background text-foreground">
      <TooltipProvider delayDuration={150} disableHoverableContent>
        <Outlet />
      </TooltipProvider>
    </div>
  )
}
