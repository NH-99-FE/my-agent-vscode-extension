import type {
  ChatSessionStateMessage,
  ExtensionToWebviewMessage,
  ProviderDefault,
  SettingsStateMessage,
  WebviewToExtensionMessage,
} from '@agent/types'

// 线程工作区消息操作接口
type ThreadWorkspaceMessageActions = {
  finishCreateSession: () => void // 完成会话创建
  onSettingsState: (snapshot: SettingsStateMessage['payload'], requestId?: string) => void // 处理设置状态更新
  onSystemError: (message: string, requestId?: string) => void // 处理系统错误
  onSessionCreated: (sessionId: string) => void // 处理会话创建完成
  onSessionState: (session: ChatSessionStateMessage['payload']['session'], requestId?: string) => void // 处理会话详情回包
  onHistoryList: (sessions: Array<{ id: string; title: string; updatedAt: number }>) => void // 处理历史列表更新
}

// 历史标题最大长度
const HISTORY_TITLE_MAX_LENGTH = 24

/**
 * 根据会话消息生成历史标题
 * @param messages 会话消息数组
 * @returns 生成的历史标题
 *
 * 生成规则：
 * - 优先首条用户消息
 * - 为空时回退为"新会话"
 * - 超长时截断并追加省略号
 */
export function buildHistoryTitleFromMessages(messages: Array<{ role: string; text: string }>): string {
  const firstUserMessage = messages.find(message => message.role === 'user')
  const normalized = firstUserMessage?.text.trim() ?? ''
  if (!normalized) {
    return '新会话'
  }
  if (normalized.length <= HISTORY_TITLE_MAX_LENGTH) {
    return normalized
  }
  return `${normalized.slice(0, HISTORY_TITLE_MAX_LENGTH)}...`
}

/**
 * 构建创建会话消息
 * @param requestId 请求 ID
 * @returns 创建会话消息对象
 */
export function buildCreateSessionMessage(requestId: string): WebviewToExtensionMessage {
  return {
    type: 'chat.session.create',
    requestId,
  }
}

/**
 * 构建获取设置消息
 * @param requestId 请求 ID
 * @returns 获取设置消息对象
 */
export function buildSettingsGetMessage(requestId: string): WebviewToExtensionMessage {
  return {
    type: 'settings.get',
    requestId,
  }
}

/**
 * 构建更新设置消息
 * @param requestId 请求 ID
 * @param providerDefault 默认 provider
 * @param openaiBaseUrl OpenAI 基础 URL
 * @param defaultModel 默认模型
 * @param models 模型列表
 * @returns 更新设置消息对象
 */
export function buildSettingsUpdateMessage(
  requestId: string,
  providerDefault: ProviderDefault,
  openaiBaseUrl: string,
  defaultModel: string,
  models: string[]
): WebviewToExtensionMessage {
  const normalizedDefaultModel = defaultModel.trim()
  const normalizedModels = models.map(item => item.trim()).filter(Boolean)
  const basePayload: Extract<WebviewToExtensionMessage, { type: 'settings.update' }>['payload'] = {
    providerDefault,
    openaiBaseUrl,
  }
  const payload = {
    ...basePayload,
    ...(normalizedDefaultModel ? { openaiDefaultModel: normalizedDefaultModel } : {}),
    ...(normalizedModels.length > 0 ? { openaiModels: normalizedModels } : {}),
  }

  return {
    type: 'settings.update',
    requestId,
    payload,
  }
}

/**
 * 构建设置 API Key 消息
 * @param requestId 请求 ID
 * @param apiKey API Key
 * @returns 设置 API Key 消息对象
 */
export function buildSettingsApiKeySetMessage(requestId: string, apiKey: string): WebviewToExtensionMessage {
  return {
    type: 'settings.apiKey.set',
    requestId,
    payload: {
      apiKey,
    },
  }
}

/**
 * 构建删除 API Key 消息
 * @param requestId 请求 ID
 * @returns 删除 API Key 消息对象
 */
export function buildSettingsApiKeyDeleteMessage(requestId: string): WebviewToExtensionMessage {
  return {
    type: 'settings.apiKey.delete',
    requestId,
  }
}

/**
 * 构建获取历史记录消息
 * @param requestId 请求 ID
 * @returns 获取历史记录消息对象
 */
export function buildChatHistoryGetMessage(requestId: string): WebviewToExtensionMessage {
  return {
    type: 'chat.history.get',
    requestId,
  }
}

/**
 * 构建删除历史会话消息
 * @param requestId 请求 ID
 * @param sessionId 待删除会话 ID
 * @returns 删除历史会话消息对象
 */
export function buildChatHistoryDeleteMessage(requestId: string, sessionId: string): WebviewToExtensionMessage {
  return {
    type: 'chat.history.delete',
    requestId,
    payload: {
      sessionId,
    },
  }
}

/**
 * 构建按会话 ID 获取会话详情消息
 * @param requestId 请求 ID
 * @param sessionId 会话 ID
 * @returns 获取会话详情消息对象
 */
export function buildChatSessionGetMessage(requestId: string, sessionId: string): WebviewToExtensionMessage {
  return {
    type: 'chat.session.get',
    requestId,
    payload: {
      sessionId,
    },
  }
}

/**
 * 处理线程工作区消息
 * @param message 扩展发送的消息
 * @param actions 线程工作区消息操作接口
 */
export function handleThreadWorkspaceMessage(message: ExtensionToWebviewMessage, actions: ThreadWorkspaceMessageActions): void {
  switch (message.type) {
    case 'chat.session.created': {
      actions.finishCreateSession()
      actions.onSessionCreated(message.payload.sessionId)
      return
    }
    case 'settings.state': {
      actions.onSettingsState(message.payload, message.requestId)
      return
    }
    case 'system.error': {
      actions.finishCreateSession()
      actions.onSystemError(message.payload.message, message.requestId)
      return
    }
    case 'chat.history.list': {
      actions.onHistoryList(message.payload.sessions)
      return
    }
    case 'chat.session.state': {
      actions.onSessionState(message.payload.session, message.requestId)
      return
    }
    default: {
      return
    }
  }
}
