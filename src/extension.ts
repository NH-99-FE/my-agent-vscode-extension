import * as vscode from 'vscode'
import type { ExtensionToWebviewMessage } from '@agent/types'
import { registerWebviewMessageHandler } from './core/webview/messageHandler'
import { createOrShowAgentPanel } from './core/webview/panel'

/**
 * 扩展激活入口：
 * 1. 注册命令 `agent.openChat`
 * 2. 命令触发时创建或复用 Chat Webview
 * 3. 首次创建面板时绑定消息处理器
 */
export function activate(context: vscode.ExtensionContext) {
  const openChatCommand = vscode.commands.registerCommand('agent.openChat', async () => {
    // createOrShow 会返回是否首次创建，用于区分是否需要重复绑定监听器。
    const { panel, isNew } = await createOrShowAgentPanel(context)

    // 已存在面板时仅显示，不重复注册 onDidReceiveMessage，避免重复响应。
    if (!isNew) {
      return
    }

    // 将消息处理器生命周期绑定到 extension context，扩展卸载时自动清理。
    const messageDisposable = registerWebviewMessageHandler(panel, context)
    context.subscriptions.push(messageDisposable)

    // 面板首次就绪后通知前端，可用于前端初始化状态切换（如 loading -> ready）。
    const readyMessage: ExtensionToWebviewMessage = {
      type: 'system.ready',
      payload: { timestamp: Date.now() },
    }
    await panel.webview.postMessage(readyMessage)
  })

  context.subscriptions.push(openChatCommand)
}

export function deactivate() {}
