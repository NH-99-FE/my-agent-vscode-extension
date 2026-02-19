import * as vscode from 'vscode'
import { AGENT_CHAT_VIEW_ID, AgentWebviewViewProvider } from './core/webview/viewProvider'

/**
 * 扩展激活入口函数
 * @param context VS Code 扩展上下文
 *
 * 激活流程：
 * 1. 注册命令 `agent.openChat`
 * 2. 注册 WebviewViewProvider 承载聊天视图
 * 3. 命令触发时打开并聚焦聊天视图
 */
export function activate(context: vscode.ExtensionContext) {
  const viewProvider = new AgentWebviewViewProvider(context)
  const viewProviderDisposable = vscode.window.registerWebviewViewProvider(AGENT_CHAT_VIEW_ID, viewProvider, {
    webviewOptions: {
      retainContextWhenHidden: true,
    },
  })

  const openChatCommand = vscode.commands.registerCommand('agent.openChat', async () => {
    await viewProvider.reveal()
  })

  context.subscriptions.push(viewProviderDisposable)
  context.subscriptions.push(openChatCommand)
}

// 扩展停用函数
export function deactivate() {}
