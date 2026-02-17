import { createHashRouter } from 'react-router'
import { RootLayout } from './layout/RootLayout'
import { WorkspaceLayout } from './layout/WorkspaceLayout'
import { ThreadPage } from './pages/thread'
import { ThreadDetailPage } from './pages/threadDetail'

// Webview 首次加载路径通常包含 `index.html`，使用 Hash Router 可避免被 `:threadId` 误匹配。
export const router = createHashRouter([
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
