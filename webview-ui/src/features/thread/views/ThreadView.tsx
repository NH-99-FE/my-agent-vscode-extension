import bgLogo from '@/components/icons/bg-logo.svg'
import { TaskList } from '../components/TasksList'
import { useNavigate, useOutletContext } from 'react-router'
import { useThreadHistoryItems } from '../store/threadWorkspaceStore'

type ThreadOutletContext = {
  openHistoryCard: () => void
}

export const ThreadView = () => {
  const { openHistoryCard } = useOutletContext<ThreadOutletContext>()
  const historyItems = useThreadHistoryItems()
  const navigate = useNavigate()

  // TaskList 只展示最新的 5 条
  const tasks = historyItems.slice(0, 5).map(item => ({
    id: item.sessionId,
    title: item.title,
    updatedAt: item.updatedAt,
  }))

  if (tasks.length === 0) {
    return (
      <div className="relative h-full px-1">
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <img src={bgLogo} alt="背景logo" className="size-10" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full px-1">
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <img src={bgLogo} alt="背景logo" className="size-10" />
      </div>
      <TaskList
        tasks={tasks}
        onViewAllClick={openHistoryCard}
        onItemClick={id => {
          navigate(`/${id}`)
        }}
      />
    </div>
  )
}
