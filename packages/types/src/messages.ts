/**
 * 协议消息公共元信息。
 * `requestId` 用于请求-响应配对，便于前端定位某次请求的返回。
 */
export interface MessageMeta {
  requestId?: string
}

/**
 * 推理强度等级。
 */
export type ReasoningLevel = 'low' | 'medium' | 'high' | 'ultra'

/**
 * 用户附加的上下文文件描述。
 */
export interface ChatAttachment {
  path: string
  name: string
}

/**
 * 前端 -> 扩展：连通性探活消息。
 */
export interface PingMessage extends MessageMeta {
  type: 'ping'
  /**
   * 可选时间戳，前端可携带发送时间用于延迟估算。
   */
  payload?: {
    timestamp?: number
  }
}

/**
 * 前端 -> 扩展：发起聊天请求。
 */
export interface ChatSendMessage extends MessageMeta {
  type: 'chat.send'
  payload: {
    /**
     * 会话 ID，由前端生成或从历史会话恢复。
     */
    sessionId: string
    /**
     * 用户输入的原始文本。
     */
    text: string
    /**
     * 前端选择的目标模型标识。
     */
    model: string
    /**
     * 推理强度等级。
     */
    reasoningLevel: ReasoningLevel
    /**
     * 参与本次请求的附件列表。
     */
    attachments: ChatAttachment[]
  }
}

/**
 * 前端 -> 扩展：取消指定会话的进行中请求。
 */
export interface ChatCancelMessage extends MessageMeta {
  type: 'chat.cancel'
  payload: {
    sessionId: string
  }
}

/**
 * 前端 -> 扩展：请求打开文件选择器以添加上下文文件。
 */
export interface ContextFilesPickMessage extends MessageMeta {
  type: 'context.files.pick'
  payload: {
    /**
     * 本次最多允许选择的文件数。
     */
    maxCount: number
  }
}

/**
 * Webview 发给扩展的所有入站消息联合类型。
 */
export type WebviewToExtensionMessage = PingMessage | ChatSendMessage | ChatCancelMessage | ContextFilesPickMessage

/**
 * 扩展 -> 前端：ping 的响应消息。
 */
export interface PongMessage extends MessageMeta {
  type: 'pong'
  payload: {
    /**
     * 扩展侧生成的响应时间戳。
     */
    timestamp: number
  }
}

/**
 * 扩展 -> 前端：系统就绪事件。
 */
export interface SystemReadyMessage extends MessageMeta {
  type: 'system.ready'
  payload: {
    timestamp: number
  }
}

/**
 * 扩展 -> 前端：统一系统错误事件。
 */
export interface SystemErrorMessage extends MessageMeta {
  type: 'system.error'
  payload: {
    message: string
  }
}

/**
 * 扩展 -> 前端：流式增量输出（token/chunk）。
 */
export interface ChatDeltaMessage extends MessageMeta {
  type: 'chat.delta'
  payload: {
    sessionId: string
    /**
     * 新增文本片段，前端应增量拼接。
     */
    textDelta: string
  }
}

/**
 * 扩展 -> 前端：流式输出结束事件。
 */
export interface ChatDoneMessage extends MessageMeta {
  type: 'chat.done'
  payload: {
    sessionId: string
    /**
     * 结束原因：正常停止、长度截断、主动取消或错误结束。
     */
    finishReason: 'stop' | 'length' | 'cancelled' | 'error'
  }
}

/**
 * 扩展 -> 前端：聊天请求失败事件（业务级错误）。
 */
export interface ChatErrorMessage extends MessageMeta {
  type: 'chat.error'
  payload: {
    sessionId: string
    message: string
  }
}

/**
 * 扩展 -> 前端：文件选择结果回包。
 */
export interface ContextFilesPickedMessage extends MessageMeta {
  type: 'context.files.picked'
  payload: {
    files: Array<{
      /**
       * 文件绝对路径（fsPath）。
       */
      path: string
      /**
       * 文件名（不含目录）。
       */
      name: string
    }>
  }
}

/**
 * 扩展发给 Webview 的所有出站消息联合类型。
 */
export type ExtensionToWebviewMessage =
  | PongMessage
  | SystemReadyMessage
  | SystemErrorMessage
  | ChatDeltaMessage
  | ChatDoneMessage
  | ChatErrorMessage
  | ContextFilesPickedMessage
