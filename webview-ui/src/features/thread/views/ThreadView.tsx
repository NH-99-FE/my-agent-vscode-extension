import { TaskList } from '../components/TasksList'
import { useNavigate, useOutletContext } from 'react-router'
import { useThreadHistoryItems } from '../store/threadWorkspaceStore'
import { Webhook } from 'lucide-react'

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

  return (
    <div className="relative h-full px-1">
      <Webhook className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <TaskList
        tasks={tasks}
        onViewAllClick={openHistoryCard}
        emptyText="还没有对话记录哦"
        onItemClick={id => {
          navigate(`/${id}`)
        }}
      />
    </div>
  )
}
