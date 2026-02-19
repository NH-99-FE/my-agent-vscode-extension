import * as vscode from 'vscode'
import type { ExtensionToWebviewMessage } from '@agent/types'
import { registerWebviewMessageHandler } from './messageHandler'
import { getWebviewHtml } from './html'

export const AGENT_VIEW_CONTAINER_ID = 'agent'
export const AGENT_CHAT_VIEW_ID = 'agent.chatView'

/**
 * 侧边栏 Webview 视图提供者。
 * 负责初始化 Webview HTML、绑定消息处理器，并在首次就绪后发送 system.ready。
 */
export class AgentWebviewViewProvider implements vscode.WebviewViewProvider {
  private currentViewDisposable: vscode.Disposable | undefined

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    // 重新 resolve 时先清理旧监听，避免重复响应。
    this.currentViewDisposable?.dispose()
    this.currentViewDisposable = undefined

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    }
    webviewView.webview.html = await getWebviewHtml(webviewView.webview, this.context.extensionUri)

    const messageDisposable = registerWebviewMessageHandler(webviewView, this.context)
    const disposeViewDisposable = webviewView.onDidDispose(() => {
      this.currentViewDisposable?.dispose()
      this.currentViewDisposable = undefined
    })
    this.currentViewDisposable = {
      dispose: () => {
        messageDisposable.dispose()
        disposeViewDisposable.dispose()
      },
    }

    const readyMessage: ExtensionToWebviewMessage = {
      type: 'system.ready',
      payload: { timestamp: Date.now() },
    }
    await webviewView.webview.postMessage(readyMessage)
  }

  async reveal(): Promise<void> {
    // 默认打开左侧活动栏容器并聚焦聊天视图。
    await executeCommandSafely(`workbench.view.extension.${AGENT_VIEW_CONTAINER_ID}`)
    await executeCommandSafely(`${AGENT_CHAT_VIEW_ID}.focus`)
  }
}

async function executeCommandSafely(command: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(command)
  } catch {
    // 不同 VS Code 版本命令可用性不同，失败时静默降级。
  }
}
