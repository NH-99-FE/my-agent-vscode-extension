import { useParams } from 'react-router'
import { ThreadDetailView } from '@/features/thread/views/ThreadDetailView'

export const ThreadDetailPage = () => {
  const { threadId } = useParams()
  return <ThreadDetailView threadId={threadId} />
}
