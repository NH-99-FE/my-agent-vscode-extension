# bridge 使用说明

本文档说明 `webview-ui/src/lib/bridge.ts` 的用途与用法。

## 1. 作用

`bridge` 是 Webview 前端和 VS Code 扩展后端之间的通信封装，提供两个能力：

- `send(...)`：前端发消息给扩展后端
- `onMessage(...)`：前端监听扩展后端回包

对应源码：`webview-ui/src/lib/bridge.ts`

## 2. 消息方向与类型

消息类型定义在：`packages/types/src/messages.ts`

- 前端 -> 后端：`WebviewToExtensionMessage`
- 后端 -> 前端：`ExtensionToWebviewMessage`

当前常用类型：

- 前端发：`ping`、`chat.send`、`chat.cancel`
- 后端回：`pong`、`system.ready`、`system.error`、`chat.delta`、`chat.done`、`chat.error`

## 3. 基本用法

```tsx
import { useEffect } from 'react'
import type { WebviewToExtensionMessage } from '@agent/types'
import { bridge } from '@/lib/bridge'

function Demo() {
  useEffect(() => {
    const dispose = bridge.onMessage(message => {
      console.log('from extension:', message)
    })

    return dispose
  }, [])

  const send = () => {
    const message: WebviewToExtensionMessage = {
      type: 'chat.send',
      payload: {
        sessionId: 'session-1',
        text: 'hello',
      },
    }
    bridge.send(message)
  }

  return <button onClick={send}>Send</button>
}
```

## 4. dispose 是什么

`bridge.onMessage(...)` 返回的 `dispose` 是“取消监听函数”。

- 注册时：内部 `window.addEventListener('message', handler)`
- dispose 时：内部 `window.removeEventListener('message', handler)`

在 React 里必须 `return dispose`，避免重复监听和内存泄漏。

## 5. 运行环境说明

`bridge` 依赖 VS Code 注入的 `acquireVsCodeApi()`。

- 在 **Extension Development Host** 中：通信正常
- 在 `pnpm dev:web` 浏览器页面中：`acquireVsCodeApi` 不存在，`send` 会静默降级（不会发到后端）

所以：

- 调 UI：`pnpm dev:web`
- 调前后端通信：用 VS Code `F5 -> Run Extension` 打开的宿主窗口

## 6. 常见问题

1. 点击发送没反应  
   原因通常是当前不在 Webview 宿主环境，或未重新构建扩展产物。  
   建议先执行：`pnpm build:web && pnpm copy:web && pnpm build:ext`，再 `F5`。

2. 收到重复消息  
   通常是忘记在 `useEffect` 里返回 `dispose`。

3. 类型报错  
   优先检查消息对象是否满足 `WebviewToExtensionMessage` 联合类型要求（`type` 与 `payload` 字段匹配）。
