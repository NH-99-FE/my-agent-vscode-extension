import type { ExtensionToWebviewMessage, ProviderDefault, SettingsStateMessage, WebviewToExtensionMessage } from '@agent/types'

export type ThreadWorkspaceMessageActions = {
  finishCreateSession: () => void
  onSettingsState: (snapshot: SettingsStateMessage['payload'], requestId?: string) => void
  onSystemError: (message: string, requestId?: string) => void
  onSessionCreated: (sessionId: string) => void
}

const HISTORY_TITLE_MAX_LENGTH = 24

/**
 * 根据会话消息生成历史标题：
 * - 优先首条用户消息
 * - 为空时回退为“新会话”
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

export function buildCreateSessionMessage(requestId: string): WebviewToExtensionMessage {
  return {
    type: 'chat.session.create',
    requestId,
  }
}

export function buildSettingsGetMessage(requestId: string): WebviewToExtensionMessage {
  return {
    type: 'settings.get',
    requestId,
  }
}

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

export function buildSettingsApiKeySetMessage(requestId: string, apiKey: string): WebviewToExtensionMessage {
  return {
    type: 'settings.apiKey.set',
    requestId,
    payload: {
      apiKey,
    },
  }
}

export function buildSettingsApiKeyDeleteMessage(requestId: string): WebviewToExtensionMessage {
  return {
    type: 'settings.apiKey.delete',
    requestId,
  }
}

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
    default: {
      return
    }
  }
}
