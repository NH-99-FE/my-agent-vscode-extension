import { Outlet, useParams } from 'react-router'
import { TopBar } from './TopBar'
import { Composer } from '@/features/thread/components/Composer'

export function WorkspaceLayout() {
  const { threadId } = useParams()
  const mode = threadId ? 'detail' : 'thread'

  return (
    <div className="flex h-dvh flex-col">
      <TopBar mode={mode} />
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
      <Composer />
    </div>
  )
}
