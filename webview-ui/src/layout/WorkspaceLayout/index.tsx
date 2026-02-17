import { Outlet, useParams } from 'react-router'
import { TopBar } from './TopBar'
import { Composer } from '@/features/thread/components/Composer'
import { useState } from 'react'
import { HistorySearchCard } from '@/features/thread/components/HistorySearchCard'

export function WorkspaceLayout() {
  const { threadId } = useParams()
  const mode = threadId ? 'detail' : 'thread'
  // 统一管理历史搜索卡片显隐，TopBar 和任务列表都复用这一个状态。
  const [historyOpen, setHistoryOpen] = useState(false)

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        mode={mode}
        onHistoryClick={() => {
          setHistoryOpen(current => !current)
        }}
      />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <Outlet
          context={{
            // 通过 Outlet context 暴露给 ThreadView，用于“查看全部”直接打开卡片。
            openHistoryCard: () => setHistoryOpen(true),
          }}
        />
        {historyOpen ? (
          <>
            <div className="absolute inset-0 z-20" onClick={() => setHistoryOpen(false)} />
            <div className="absolute inset-x-2 top-1 z-30">
              <HistorySearchCard />
            </div>
          </>
        ) : null}
      </main>
      <Composer routeThreadId={threadId} />
    </div>
  )
}
