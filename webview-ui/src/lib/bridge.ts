import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '@agent/types'

// VS Code 在 Webview 环境注入的最小 API 形状，这里只声明本项目目前需要的 postMessage
interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void
}

// 统一的前端消息监听函数签名
type MessageListener = (message: ExtensionToWebviewMessage) => void

// Webview 与扩展之间的通信桥接层
// - 统一封装 postMessage
// - 统一封装 message 监听
// - 在浏览器开发模式下提供无害降级
class WebviewBridge {
  private vscodeApi: VsCodeApi | undefined

  // 初始化桥接实例，在 VS Code Webview 环境中获取 API，否则降级处理
  constructor() {
    // 在 VS Code Webview 中该函数存在；在浏览器独立调试时不存在
    // 这里做降级处理，避免本地 Vite 调试直接报错
    if (typeof acquireVsCodeApi === 'function') {
      this.vscodeApi = acquireVsCodeApi()
    }
  }

  /**
   * 发送前端 -> 扩展消息
   * @param message 要发送的消息
   * 如果当前不在 VS Code Webview（例如本地浏览器），该调用会静默跳过
   */
  send(message: WebviewToExtensionMessage): void {
    this.vscodeApi?.postMessage(message)
  }

  /**
   * 订阅扩展 -> 前端消息
   * @param listener 消息监听回调函数
   * @returns 反注册函数，调用后会移除 window message 监听
   */
  onMessage(listener: MessageListener): () => void {
    const handler = (event: MessageEvent<unknown>) => {
      const message = event.data
      // 对消息做最小 runtime 校验，避免任意 window message 污染业务逻辑
      if (!isExtensionMessage(message)) {
        return
      }
      listener(message)
    }

    window.addEventListener('message', handler)
    return () => {
      window.removeEventListener('message', handler)
    }
  }
}

// 扩展出站消息白名单，用于 runtime 类型收窄，确保进入业务层的是协议内消息
const extensionToWebviewTypes: ExtensionToWebviewMessage['type'][] = [
  'pong',
  'system.ready',
  'system.error',
  'chat.delta',
  'chat.done',
  'chat.error',
  'chat.history.list',
  'context.files.picked',
  'chat.session.created',
  'chat.session.state',
  'settings.state',
]

/**
 * 检查消息是否为有效的扩展出站消息
 * @param value 待检查的未知值
 * @returns 是否为有效的扩展消息
 */
function isExtensionMessage(value: unknown): value is ExtensionToWebviewMessage {
  // 必须是对象且非 null
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const maybeMessage = value as Record<string, unknown>
  // 协议消息必须包含字符串 type 字段
  if (typeof maybeMessage.type !== 'string') {
    return false
  }

  // type 必须属于已知协议集合
  return extensionToWebviewTypes.includes(maybeMessage.type as ExtensionToWebviewMessage['type'])
}

// 单例导出，避免在多个组件中重复创建桥接实例
export const bridge = new WebviewBridge()
