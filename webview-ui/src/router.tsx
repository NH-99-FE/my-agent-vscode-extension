import { createBrowserRouter } from 'react-router'
import { RootLayout } from './layout/RootLayout'
import { WorkspaceLayout } from './layout/WorkspaceLayout'
import { ThreadPage } from './pages/thread'
import { ThreadDetailPage } from './pages/threadDetail'

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    children: [
      {
        Component: WorkspaceLayout,
        path: '/',
        children: [
          { index: true, Component: ThreadPage },
          { path: ':threadId', Component: ThreadDetailPage },
        ],
      },
    ],
  },
])
