/**
 * 统一导出共享上下文类型。
 */
export type { BuiltContext, ChatMessage, ChatSession, ContextSnippet, ContextSource } from './context'

/**
 * 统一导出 Webview <-> Extension 协议消息类型。
 */
export type {
  ChatCancelMessage,
  ChatDoneMessage,
  ChatDeltaMessage,
  ChatErrorMessage,
  ChatSendMessage,
  ContextFilesPickedMessage,
  ContextFilesPickMessage,
  ExtensionToWebviewMessage,
  MessageMeta,
  PingMessage,
  PongMessage,
  SystemErrorMessage,
  SystemReadyMessage,
  WebviewToExtensionMessage,
} from './messages'
