// 统一导出共享上下文类型
export type { BuiltContext, ChatMessage, ChatMessageState, ChatSession, ContextSnippet, ContextSource } from './context'

// 统一导出 Webview <-> Extension 协议消息类型
export type {
  ChatCancelMessage,
  ChatDoneMessage,
  ChatDeltaMessage,
  ChatErrorMessage,
  ChatHistoryDeleteMessage,
  ChatSessionGetMessage,
  ChatSessionCreatedMessage,
  ChatSessionStateMessage,
  ChatSessionCreateMessage,
  ChatSendMessage,
  ChatAttachment,
  ContextFilesPickedMessage,
  ContextFilesPickMessage,
  ContextEditorStateMessage,
  ContextEditorStateSubscribeMessage,
  ContextEditorStateUnsubscribeMessage,
  ExtensionToWebviewMessage,
  MessageMeta,
  PingMessage,
  PongMessage,
  ProviderDefault,
  ReasoningLevel,
  SettingsGetMessage,
  SettingsSaveMessage,
  SettingsStateMessage,
  SystemErrorMessage,
  SystemReadyMessage,
  WebviewToExtensionMessage,
} from './messages'
