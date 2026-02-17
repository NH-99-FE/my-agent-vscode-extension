// 协议消息公共元信息
// `requestId` 用于请求-响应配对，便于前端定位某次请求的返回
export interface MessageMeta {
  requestId?: string // 请求 ID，用于关联请求和响应
}

// 推理强度等级
export type ReasoningLevel = 'low' | 'medium' | 'high' | 'ultra' // 低、中、高、超高

// 用户附加的上下文文件描述
export interface ChatAttachment {
  path: string // 文件路径
  name: string // 文件名
}

// 默认 Provider 选择策略
export type ProviderDefault = 'auto' | 'mock' | 'openai' // 自动、模拟、OpenAI

// 前端 -> 扩展：连通性探活消息
export interface PingMessage extends MessageMeta {
  type: 'ping' // 消息类型
  payload?: {
    timestamp?: number // 可选时间戳，前端可携带发送时间用于延迟估算
  }
}

// 前端 -> 扩展：发起聊天请求
export interface ChatSendMessage extends MessageMeta {
  type: 'chat.send' // 消息类型
  payload: {
    sessionId: string // 会话 ID，由前端生成或从历史会话恢复
    text: string // 用户输入的原始文本
    model: string // 前端选择的目标模型标识
    reasoningLevel: ReasoningLevel // 推理强度等级
    attachments: ChatAttachment[] // 参与本次请求的附件列表
  }
}

// 前端 -> 扩展：取消指定会话的进行中请求
export interface ChatCancelMessage extends MessageMeta {
  type: 'chat.cancel' // 消息类型
  payload: {
    sessionId: string // 要取消的会话 ID
  }
}

// 前端 -> 扩展：请求打开文件选择器以添加上下文文件
export interface ContextFilesPickMessage extends MessageMeta {
  type: 'context.files.pick' // 消息类型
  payload: {
    maxCount: number // 本次最多允许选择的文件数
  }
}

// 前端 -> 扩展：读取当前设置状态
export interface SettingsGetMessage extends MessageMeta {
  type: 'settings.get' // 消息类型
}

// 前端 -> 扩展：更新设置项（部分字段更新）
export interface SettingsUpdateMessage extends MessageMeta {
  type: 'settings.update' // 消息类型
  payload: {
    providerDefault?: ProviderDefault // 可选的默认 provider
    openaiBaseUrl?: string // 可选的 OpenAI 基础 URL
    openaiDefaultModel?: string // 可选的 OpenAI 默认模型
    openaiModels?: string[] // 可选的 OpenAI 模型列表
  }
}

// 前端 -> 扩展：写入 OpenAI API Key
export interface SettingsApiKeySetMessage extends MessageMeta {
  type: 'settings.apiKey.set' // 消息类型
  payload: {
    apiKey: string // 要设置的 API Key
  }
}

// 前端 -> 扩展：删除 OpenAI API Key
export interface SettingsApiKeyDeleteMessage extends MessageMeta {
  type: 'settings.apiKey.delete' // 消息类型
}

// 前端 -> 扩展：创建新会话
export interface ChatSessionCreateMessage extends MessageMeta {
  type: 'chat.session.create' // 消息类型
}

// Webview 发给扩展的所有入站消息联合类型
export type WebviewToExtensionMessage =
  | PingMessage
  | ChatSendMessage
  | ChatCancelMessage
  | ContextFilesPickMessage
  | SettingsGetMessage
  | SettingsUpdateMessage
  | SettingsApiKeySetMessage
  | SettingsApiKeyDeleteMessage
  | ChatSessionCreateMessage

// 扩展 -> 前端：ping 的响应消息
export interface PongMessage extends MessageMeta {
  type: 'pong' // 消息类型
  payload: {
    timestamp: number // 扩展侧生成的响应时间戳
  }
}

// 扩展 -> 前端：系统就绪事件
export interface SystemReadyMessage extends MessageMeta {
  type: 'system.ready' // 消息类型
  payload: {
    timestamp: number // 系统就绪时间戳
  }
}

// 扩展 -> 前端：统一系统错误事件
export interface SystemErrorMessage extends MessageMeta {
  type: 'system.error' // 消息类型
  payload: {
    message: string // 错误信息
  }
}

// 扩展 -> 前端：流式增量输出（token/chunk）
export interface ChatDeltaMessage extends MessageMeta {
  type: 'chat.delta' // 消息类型
  payload: {
    sessionId: string // 会话 ID
    textDelta: string // 新增文本片段，前端应增量拼接
  }
}

// 扩展 -> 前端：流式输出结束事件
export interface ChatDoneMessage extends MessageMeta {
  type: 'chat.done' // 消息类型
  payload: {
    sessionId: string // 会话 ID
    finishReason: 'stop' | 'length' | 'cancelled' | 'error' // 结束原因：正常停止、长度截断、主动取消或错误结束
  }
}

// 扩展 -> 前端：聊天请求失败事件（业务级错误）
export interface ChatErrorMessage extends MessageMeta {
  type: 'chat.error' // 消息类型
  payload: {
    sessionId: string // 会话 ID
    message: string // 错误信息
  }
}

// 扩展 -> 前端：文件选择结果回包
export interface ContextFilesPickedMessage extends MessageMeta {
  type: 'context.files.picked' // 消息类型
  payload: {
    files: Array<{
      path: string // 文件绝对路径（fsPath）
      name: string // 文件名（不含目录）
    }>
  }
}

// 扩展 -> 前端：设置状态快照
export interface SettingsStateMessage extends MessageMeta {
  type: 'settings.state' // 消息类型
  payload: {
    providerDefault: ProviderDefault // 默认 provider
    openaiBaseUrl: string // OpenAI 基础 URL
    hasOpenAiApiKey: boolean // 是否有 OpenAI API Key
    openaiDefaultModel: string // OpenAI 默认模型
    openaiModels: string[] // OpenAI 模型列表
  }
}

// 扩展 -> 前端：新会话创建完成
export interface ChatSessionCreatedMessage extends MessageMeta {
  type: 'chat.session.created' // 消息类型
  payload: {
    sessionId: string // 新创建的会话 ID
  }
}

// 扩展发给 Webview 的所有出站消息联合类型
export type ExtensionToWebviewMessage =
  | PongMessage
  | SystemReadyMessage
  | SystemErrorMessage
  | ChatDeltaMessage
  | ChatDoneMessage
  | ChatErrorMessage
  | ContextFilesPickedMessage
  | SettingsStateMessage
  | ChatSessionCreatedMessage
