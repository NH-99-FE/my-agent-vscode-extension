import type { ChatSessionStateMessage, ExtensionToWebviewMessage, SettingsStateMessage, WebviewToExtensionMessage } from '@agent/types'

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

type SettingsSavePayload = Extract<WebviewToExtensionMessage, { type: 'settings.save' }>['payload']

/**
 * 构建原子保存设置消息
 * @param requestId 请求 ID
 * @param payload 设置保存负载
 * @returns 设置保存消息对象
 */
export function buildSettingsSaveMessage(requestId: string, payload: SettingsSavePayload): WebviewToExtensionMessage {
  const normalizedPayload: SettingsSavePayload = {
    ...(payload.providerDefault !== undefined ? { providerDefault: payload.providerDefault } : {}),
    ...(payload.openaiBaseUrl !== undefined ? { openaiBaseUrl: payload.openaiBaseUrl.trim() } : {}),
    ...(payload.openaiDefaultModel !== undefined ? { openaiDefaultModel: payload.openaiDefaultModel.trim() } : {}),
    ...(payload.openaiModels !== undefined ? { openaiModels: payload.openaiModels.map(item => item.trim()).filter(Boolean) } : {}),
    ...(payload.openaiApiKey !== undefined ? { openaiApiKey: payload.openaiApiKey.trim() } : {}),
    ...(payload.deleteOpenAiApiKey === true ? { deleteOpenAiApiKey: true } : {}),
  }

  return {
    type: 'settings.save',
    requestId,
    payload: normalizedPayload,
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
