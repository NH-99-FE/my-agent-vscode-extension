import bgLogo from '@/components/icons/bg-logo.svg'
import { TaskList } from '../components/TasksList'

const tasks = [
  {
    id: '1234567890',
    content: '给右侧小图标、以及标题截断时提供 hover 展示完整标题（你项目已经有 Tooltip 了）',
    time: '20小时',
  },
  {
    id: '1234232',
    content: '给右侧小图标、以及标题截断时提供 hover 展示完整标题（你项目已经有 Tooltip 了）',
    time: '20小时',
  },
  {
    id: '1232323',
    content: '给右侧小图标、以及标题截断时提供 hover 展示完整标题（你项目已经有 Tooltip 了）',
    time: '20小时',
  },
]

export const ThreadView = () => {
  return (
    <div className="relative h-full px-1">
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <img src={bgLogo} alt="背景logo" className="size-10" />
      </div>
      <TaskList tasks={tasks} />
    </div>
  )
}
