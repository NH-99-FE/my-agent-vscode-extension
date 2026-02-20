import * as vscode from 'vscode'
import type { ChatAttachment, ExtensionToWebviewMessage, ProviderDefault, ReasoningLevel, WebviewToExtensionMessage } from '@agent/types'
import { ChatService } from '../chat/chatService'
import { SessionService } from '../chat/sessionService'
import { getEditorContextState } from '../context/editorState'
import { createLlmClient, LlmAbortError, LlmCancellationController, LlmTimeoutError } from '../llm/client'
import { SettingsService } from '../settings/settingsService'
import { SessionStore } from '../storage/sessionStore'

// 全局 LLM 客户端实例
const llmClient = createLlmClient()

// 进行中的请求信息
interface InFlightRequest {
  controller: LlmCancellationController
  requestId: string
}

interface WebviewHost {
  webview: vscode.Webview
}

/**
 * 注册 Webview -> Extension 的消息处理器
 * @param panel Webview 宿主（支持 WebviewPanel / WebviewView）
 * @param context VS Code 扩展上下文
 * @returns 可释放的资源
 *
 * 职责：
 * 1. 做基本结构校验（避免异常 payload 导致运行时崩溃）
 * 2. 根据 type 路由到对应处理逻辑
 * 3. 兜底返回统一错误消息
 */
export function registerWebviewMessageHandler(panel: WebviewHost, context: vscode.ExtensionContext): vscode.Disposable {
  const sessionStore = new SessionStore(context)
  const chatService = new ChatService(llmClient, sessionStore, context)
  const sessionService = new SessionService(sessionStore)
  const settingsService = new SettingsService(context)
  // 同一个 session 只允许一个进行中的请求，新的请求会覆盖并取消旧请求
  const inFlightBySession = new Map<string, InFlightRequest>()
  let editorStateSubscription: vscode.Disposable | undefined
  let editorStateSubscriberCount = 0

  const stopEditorStateSubscription = () => {
    editorStateSubscription?.dispose()
    editorStateSubscription = undefined
  }

  const startEditorStateSubscription = () => {
    if (editorStateSubscription) {
      return
    }

    const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(() => {
      void postEditorContextState(panel)
    })
    const onDidChangeSelection = vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        void postEditorContextState(panel)
      }
    })
    editorStateSubscription = {
      dispose: () => {
        onDidChangeActiveEditor.dispose()
        onDidChangeSelection.dispose()
      },
    }
  }

  const subscribeEditorState = () => {
    editorStateSubscriberCount += 1
    startEditorStateSubscription()
  }

  const unsubscribeEditorState = () => {
    if (editorStateSubscriberCount <= 0) {
      return
    }
    editorStateSubscriberCount -= 1
    if (editorStateSubscriberCount === 0) {
      stopEditorStateSubscription()
    }
  }

  const onDidReceiveMessageDisposable = panel.webview.onDidReceiveMessage(async (message: unknown) => {
    const parsedMessage = parseInboundMessage(message)
    if (!parsedMessage) {
      // 非法格式直接返回 system.error，便于前端统一提示。
      await postSystemError(panel, 'Invalid message payload.')
      return
    }

    try {
      switch (parsedMessage.type) {
        case 'ping':
          // 最小联通验证：收到 ping 即回 pong，带 requestId 便于前端做请求匹配。
          await postTypedMessage(panel, {
            type: 'pong',
            ...(parsedMessage.requestId !== undefined ? { requestId: parsedMessage.requestId } : {}),
            payload: {
              timestamp: Date.now(),
            },
          })
          break
        case 'chat.send':
          await handleChatSend(panel, parsedMessage, chatService, inFlightBySession)
          break
        case 'chat.cancel':
          await handleChatCancel(parsedMessage, chatService, inFlightBySession)
          break
        case 'context.files.pick':
          await handleContextFilesPick(panel, parsedMessage)
          break
        case 'context.editor.state.subscribe':
          await handleContextEditorStateSubscribe(panel, parsedMessage, subscribeEditorState)
          break
        case 'context.editor.state.unsubscribe':
          handleContextEditorStateUnsubscribe(unsubscribeEditorState)
          break
        case 'settings.get':
          await handleSettingsGet(panel, parsedMessage, settingsService)
          break
        case 'settings.save':
          await handleSettingsSave(panel, parsedMessage, settingsService)
          break
        case 'chat.session.create':
          await handleChatSessionCreate(panel, parsedMessage, sessionService)
          break
        case 'chat.session.get':
          await handleChatSessionGet(panel, parsedMessage, sessionService)
          break
        case 'chat.history.get':
          await handleChatHistoryGet(panel, parsedMessage, sessionService)
          break
        case 'chat.history.delete':
          await handleChatHistoryDelete(panel, parsedMessage, sessionService)
          break
      }
    } catch (error) {
      await postSystemError(panel, toErrorMessage(error), parsedMessage.requestId)
    }
  })

  return {
    dispose: () => {
      onDidReceiveMessageDisposable.dispose()
      editorStateSubscriberCount = 0
      stopEditorStateSubscription()
    },
  }
}

/**
 * 处理 chat.send：
 * 1. 组装最小请求参数
 * 2. 消费 LLM 流式事件
 * 3. 映射为协议内 chat.delta/chat.done/chat.error
 */
async function handleChatSend(
  panel: WebviewHost,
  message: Extract<WebviewToExtensionMessage, { type: 'chat.send' }>,
  chatService: ChatService,
  inFlightBySession: Map<string, InFlightRequest>
): Promise<void> {
  // 用户连续发送同一会话请求时，先取消旧流，防止并发回包乱序。
  const previous = inFlightBySession.get(message.payload.sessionId)
  previous?.controller.cancel('superseded by a new request')

  const controller = new LlmCancellationController()
  inFlightBySession.set(message.payload.sessionId, {
    controller,
    requestId: message.requestId,
  })

  try {
    const stream = chatService.streamChat(
      {
        requestId: message.requestId,
        ...message.payload,
      },
      controller.signal
    )

    // 消费 LLM 流并映射到 Webview 协议事件。
    for await (const event of stream) {
      switch (event.type) {
        case 'text-delta':
          await postTypedMessage(panel, {
            type: 'chat.delta',
            ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
            payload: {
              sessionId: message.payload.sessionId,
              textDelta: event.delta,
            },
          })
          break
        case 'done':
          await postTypedMessage(panel, {
            type: 'chat.done',
            ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
            payload: {
              sessionId: message.payload.sessionId,
              finishReason: event.finishReason,
            },
          })
          break
        case 'error':
          await postTypedMessage(panel, {
            type: 'chat.error',
            ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
            payload: {
              sessionId: message.payload.sessionId,
              message: event.message,
            },
          })
          break
      }
    }
  } catch (error) {
    if (error instanceof LlmAbortError) {
      // 取消场景走 done(cancelled)，而不是 error。
      await postTypedMessage(panel, {
        type: 'chat.done',
        ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
        payload: {
          sessionId: message.payload.sessionId,
          finishReason: 'cancelled',
        },
      })
      return
    }

    if (error instanceof LlmTimeoutError) {
      await postTypedMessage(panel, {
        type: 'chat.error',
        ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
        payload: {
          sessionId: message.payload.sessionId,
          message: error.message,
        },
      })
      return
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown chat error.'
    await postTypedMessage(panel, {
      type: 'chat.error',
      ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
      payload: {
        sessionId: message.payload.sessionId,
        message: errorMessage,
      },
    })
  } finally {
    // 仅清理当前请求创建的控制器，避免误删后续新请求状态。
    const current = inFlightBySession.get(message.payload.sessionId)
    if (current?.controller === controller) {
      inFlightBySession.delete(message.payload.sessionId)
    }
  }
}

async function handleChatCancel(
  message: Extract<WebviewToExtensionMessage, { type: 'chat.cancel' }>,
  chatService: ChatService,
  inFlightBySession: Map<string, InFlightRequest>
): Promise<void> {
  const inFlight = inFlightBySession.get(message.payload.sessionId)
  if (!inFlight) {
    // 取消请求幂等化：无进行中请求时静默返回，避免竞态产生误报。
    return
  }
  // 当 cancel 携带 requestId 时，仅允许取消命中的 active 请求，避免旧 cancel 误杀新流。
  if (message.requestId !== undefined && message.requestId !== inFlight.requestId) {
    return
  }

  // 取消后由上游 catch 统一转换为 done(cancelled) 响应。
  inFlight.controller.cancel('cancelled by user')
  await chatService.markUserTurnCancelled(message.payload.sessionId, inFlight.requestId)
}

async function handleContextFilesPick(
  panel: WebviewHost,
  message: Extract<WebviewToExtensionMessage, { type: 'context.files.pick' }>
): Promise<void> {
  const maxCount = Math.max(0, Math.floor(message.payload.maxCount))
  if (maxCount === 0) {
    await postTypedMessage(panel, {
      type: 'context.files.picked',
      ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
      payload: { files: [] },
    })
    return
  }

  const pickedUris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectMany: true,
    canSelectFolders: false,
    openLabel: '添加上下文文件',
  })

  const files = (pickedUris ?? []).slice(0, maxCount).map(uri => ({
    path: uri.fsPath,
    name: uri.path.split('/').pop() ?? uri.fsPath,
  }))

  await postTypedMessage(panel, {
    type: 'context.files.picked',
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    payload: { files },
  })
}

async function handleSettingsGet(
  panel: WebviewHost,
  message: Extract<WebviewToExtensionMessage, { type: 'settings.get' }>,
  settingsService: SettingsService
): Promise<void> {
  const state = await settingsService.getState()
  await postTypedMessage(panel, {
    type: 'settings.state',
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    payload: state,
  })
}

async function handleContextEditorStateSubscribe(
  panel: WebviewHost,
  message: Extract<WebviewToExtensionMessage, { type: 'context.editor.state.subscribe' }>,
  ensureSubscription: () => void
): Promise<void> {
  ensureSubscription()
  await postEditorContextState(panel, message.requestId)
}

function handleContextEditorStateUnsubscribe(disposeSubscription: () => void): void {
  disposeSubscription()
}

async function handleSettingsSave(
  panel: WebviewHost,
  message: Extract<WebviewToExtensionMessage, { type: 'settings.save' }>,
  settingsService: SettingsService
): Promise<void> {
  const state = await settingsService.saveSettings(message.payload)
  await postTypedMessage(panel, {
    type: 'settings.state',
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    payload: state,
  })
}

async function handleChatSessionCreate(
  panel: WebviewHost,
  message: Extract<WebviewToExtensionMessage, { type: 'chat.session.create' }>,
  sessionService: SessionService
): Promise<void> {
  const created = await sessionService.createSession()
  await postTypedMessage(panel, {
    type: 'chat.session.created',
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    payload: {
      sessionId: created.sessionId,
    },
  })
}

async function handleChatSessionGet(
  panel: WebviewHost,
  message: Extract<WebviewToExtensionMessage, { type: 'chat.session.get' }>,
  sessionService: SessionService
): Promise<void> {
  const session = await sessionService.getSessionById(message.payload.sessionId)
  await postTypedMessage(panel, {
    type: 'chat.session.state',
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    payload: {
      session: session
        ? {
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messages: session.messages,
          }
        : null,
    },
  })
}

async function handleChatHistoryGet(
  panel: WebviewHost,
  message: Extract<WebviewToExtensionMessage, { type: 'chat.history.get' }>,
  sessionService: SessionService
): Promise<void> {
  const sessions = await sessionService.getSessions()
  const historyList = sessions.map(session => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
  }))

  await postTypedMessage(panel, {
    type: 'chat.history.list',
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    payload: {
      sessions: historyList,
    },
  })
}

async function handleChatHistoryDelete(
  panel: WebviewHost,
  message: Extract<WebviewToExtensionMessage, { type: 'chat.history.delete' }>,
  sessionService: SessionService
): Promise<void> {
  await sessionService.deleteSession(message.payload.sessionId)
  const sessions = await sessionService.getSessions()
  const historyList = sessions.map(session => ({
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
  }))

  await postTypedMessage(panel, {
    type: 'chat.history.list',
    ...(message.requestId !== undefined ? { requestId: message.requestId } : {}),
    payload: {
      sessions: historyList,
    },
  })
}

/**
 * 统一系统错误消息出口，后续可在这里接入 telemetry。
 */
async function postSystemError(panel: WebviewHost, message: string, requestId?: string): Promise<void> {
  await postTypedMessage(panel, {
    type: 'system.error',
    ...(requestId !== undefined ? { requestId } : {}),
    payload: { message },
  })
}

async function postEditorContextState(panel: WebviewHost, requestId?: string): Promise<void> {
  await postTypedMessage(panel, {
    type: 'context.editor.state',
    ...(requestId !== undefined ? { requestId } : {}),
    payload: getEditorContextState(),
  })
}

/**
 * 统一发送扩展到前端消息，保持发送侧类型收敛。
 */
async function postTypedMessage(panel: WebviewHost, message: ExtensionToWebviewMessage): Promise<void> {
  await panel.webview.postMessage(message)
}

/**
 * 运行时严格解析器：
 * - 只允许协议内 message type
 * - 校验关键字段结构（尤其 chat.send）
 */
function parseInboundMessage(value: unknown): WebviewToExtensionMessage | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const maybeMessage = value as Record<string, unknown>
  if (typeof maybeMessage.type !== 'string') {
    return undefined
  }

  // requestId 允许缺省；出现时必须是字符串。
  if (maybeMessage.requestId !== undefined && typeof maybeMessage.requestId !== 'string') {
    return undefined
  }

  switch (maybeMessage.type) {
    case 'ping': {
      const parsedPayload = asOptionalObjectWithOptionalNumberTimestamp(maybeMessage.payload)
      if (maybeMessage.payload !== undefined && !parsedPayload) {
        return undefined
      }
      const pingMessage: WebviewToExtensionMessage = {
        type: 'ping',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
        ...(parsedPayload ? { payload: parsedPayload } : {}),
      }
      return pingMessage
    }
    case 'chat.send': {
      if (typeof maybeMessage.payload !== 'object' || maybeMessage.payload === null) {
        return undefined
      }
      // chat.send 要求 requestId 运行时必填，确保流式回包可做请求级防串。
      if (typeof maybeMessage.requestId !== 'string') {
        return undefined
      }
      const payload = maybeMessage.payload as Record<string, unknown>
      const sessionId = asNonEmptyString(payload.sessionId)
      const text = asString(payload.text)
      const model = asNonEmptyString(payload.model)
      const reasoningLevel = asReasoningLevel(payload.reasoningLevel)
      const attachments = asAttachments(payload.attachments)
      const includeActiveEditorContext = asOptionalBoolean(payload.includeActiveEditorContext)
      if (!sessionId || text === undefined || !model || !reasoningLevel || !attachments) {
        return undefined
      }
      if (payload.includeActiveEditorContext !== undefined && includeActiveEditorContext === undefined) {
        return undefined
      }

      const chatSendMessage: WebviewToExtensionMessage = {
        type: 'chat.send',
        requestId: maybeMessage.requestId,
        payload: {
          sessionId,
          text,
          model,
          reasoningLevel,
          attachments,
          includeActiveEditorContext: includeActiveEditorContext ?? true,
        },
      }
      return chatSendMessage
    }
    case 'chat.cancel': {
      if (typeof maybeMessage.payload !== 'object' || maybeMessage.payload === null) {
        return undefined
      }
      const payload = maybeMessage.payload as Record<string, unknown>
      if (typeof payload.sessionId !== 'string') {
        return undefined
      }

      const chatCancelMessage: WebviewToExtensionMessage = {
        type: 'chat.cancel',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
        payload: {
          sessionId: payload.sessionId,
        },
      }
      return chatCancelMessage
    }
    case 'context.files.pick': {
      if (typeof maybeMessage.payload !== 'object' || maybeMessage.payload === null) {
        return undefined
      }
      const payload = maybeMessage.payload as Record<string, unknown>
      if (typeof payload.maxCount !== 'number' || !Number.isFinite(payload.maxCount)) {
        return undefined
      }

      const contextFilesPickMessage: WebviewToExtensionMessage = {
        type: 'context.files.pick',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
        payload: {
          maxCount: payload.maxCount,
        },
      }
      return contextFilesPickMessage
    }
    case 'context.editor.state.subscribe': {
      if (maybeMessage.payload !== undefined && !isEmptyObject(maybeMessage.payload)) {
        return undefined
      }
      const subscribeMessage: WebviewToExtensionMessage = {
        type: 'context.editor.state.subscribe',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
      }
      return subscribeMessage
    }
    case 'context.editor.state.unsubscribe': {
      if (maybeMessage.payload !== undefined && !isEmptyObject(maybeMessage.payload)) {
        return undefined
      }
      const unsubscribeMessage: WebviewToExtensionMessage = {
        type: 'context.editor.state.unsubscribe',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
      }
      return unsubscribeMessage
    }
    case 'settings.get': {
      if (maybeMessage.payload !== undefined && !isEmptyObject(maybeMessage.payload)) {
        return undefined
      }

      const settingsGetMessage: WebviewToExtensionMessage = {
        type: 'settings.get',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
      }
      return settingsGetMessage
    }
    case 'settings.save': {
      if (typeof maybeMessage.payload !== 'object' || maybeMessage.payload === null) {
        return undefined
      }

      const payload = maybeMessage.payload as Record<string, unknown>
      const providerDefault = asProviderDefault(payload.providerDefault)
      const openaiBaseUrl = asString(payload.openaiBaseUrl)
      const openaiDefaultModel = asString(payload.openaiDefaultModel)
      const openaiModels = asStringArray(payload.openaiModels)
      const openaiApiKey = asNonEmptyString(payload.openaiApiKey)
      const deleteOpenAiApiKey = asOptionalBoolean(payload.deleteOpenAiApiKey)
      if (payload.providerDefault !== undefined && providerDefault === undefined) {
        return undefined
      }
      if (payload.openaiBaseUrl !== undefined && openaiBaseUrl === undefined) {
        return undefined
      }
      if (payload.openaiDefaultModel !== undefined && openaiDefaultModel === undefined) {
        return undefined
      }
      if (payload.openaiModels !== undefined && openaiModels === undefined) {
        return undefined
      }
      if (payload.openaiApiKey !== undefined && openaiApiKey === undefined) {
        return undefined
      }
      if (payload.deleteOpenAiApiKey !== undefined && deleteOpenAiApiKey === undefined) {
        return undefined
      }
      const hasAnySaveField =
        providerDefault !== undefined ||
        openaiBaseUrl !== undefined ||
        openaiDefaultModel !== undefined ||
        openaiModels !== undefined ||
        openaiApiKey !== undefined ||
        deleteOpenAiApiKey === true
      if (!hasAnySaveField) {
        return undefined
      }
      if (openaiApiKey !== undefined && deleteOpenAiApiKey === true) {
        return undefined
      }

      const settingsSaveMessage: WebviewToExtensionMessage = {
        type: 'settings.save',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
        payload: {
          ...(providerDefault !== undefined ? { providerDefault } : {}),
          ...(openaiBaseUrl !== undefined ? { openaiBaseUrl } : {}),
          ...(openaiDefaultModel !== undefined ? { openaiDefaultModel } : {}),
          ...(openaiModels !== undefined ? { openaiModels } : {}),
          ...(openaiApiKey !== undefined ? { openaiApiKey } : {}),
          ...(deleteOpenAiApiKey === true ? { deleteOpenAiApiKey: true } : {}),
        },
      }
      return settingsSaveMessage
    }
    case 'chat.session.create': {
      if (maybeMessage.payload !== undefined && !isEmptyObject(maybeMessage.payload)) {
        return undefined
      }

      const sessionCreateMessage: WebviewToExtensionMessage = {
        type: 'chat.session.create',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
      }
      return sessionCreateMessage
    }
    case 'chat.session.get': {
      if (typeof maybeMessage.payload !== 'object' || maybeMessage.payload === null) {
        return undefined
      }

      const payload = maybeMessage.payload as Record<string, unknown>
      const sessionId = asNonEmptyString(payload.sessionId)
      if (!sessionId) {
        return undefined
      }

      const sessionGetMessage: WebviewToExtensionMessage = {
        type: 'chat.session.get',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
        payload: {
          sessionId,
        },
      }
      return sessionGetMessage
    }
    case 'chat.history.get': {
      if (maybeMessage.payload !== undefined && !isEmptyObject(maybeMessage.payload)) {
        return undefined
      }

      const chatHistoryGetMessage: WebviewToExtensionMessage = {
        type: 'chat.history.get',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
      }
      return chatHistoryGetMessage
    }
    case 'chat.history.delete': {
      if (typeof maybeMessage.payload !== 'object' || maybeMessage.payload === null) {
        return undefined
      }

      const payload = maybeMessage.payload as Record<string, unknown>
      const sessionId = asNonEmptyString(payload.sessionId)
      if (!sessionId) {
        return undefined
      }

      const chatHistoryDeleteMessage: WebviewToExtensionMessage = {
        type: 'chat.history.delete',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
        payload: {
          sessionId,
        },
      }
      return chatHistoryDeleteMessage
    }
    default:
      return undefined
  }
}

/**
 * 将未知值转换为可选对象，包含可选的时间戳
 * @param value 待转换的值
 * @returns 转换后的对象或 undefined
 */
function asOptionalObjectWithOptionalNumberTimestamp(value: unknown): { timestamp?: number } | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const payload = value as Record<string, unknown>
  if (payload.timestamp !== undefined && typeof payload.timestamp !== 'number') {
    return undefined
  }
  if (typeof payload.timestamp === 'number') {
    return { timestamp: payload.timestamp }
  }
  return {}
}

/**
 * 将未知值转换为字符串
 * @param value 待转换的值
 * @returns 转换后的字符串或 undefined
 */
function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  return value
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'boolean') {
    return undefined
  }
  return value
}

/**
 * 将未知值转换为非空字符串
 * @param value 待转换的值
 * @returns 转换后的非空字符串或 undefined
 */
function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  if (!normalized) {
    return undefined
  }
  return normalized
}

/**
 * 将未知值转换为推理强度等级
 * @param value 待转换的值
 * @returns 转换后的推理强度或 undefined
 */
function asReasoningLevel(value: unknown): ReasoningLevel | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
    return value
  }
  return undefined
}

/**
 * 将未知值转换为附件数组
 * @param value 待转换的值
 * @returns 转换后的附件数组或 undefined
 */
function asAttachments(value: unknown): ChatAttachment[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const attachments: ChatAttachment[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      return undefined
    }

    const maybeAttachment = item as Record<string, unknown>
    const path = asNonEmptyString(maybeAttachment.path)
    const name = asNonEmptyString(maybeAttachment.name)
    if (!path || !name) {
      return undefined
    }

    attachments.push({ path, name })
  }

  return attachments
}

/**
 * 将未知值转换为默认 provider
 * @param value 待转换的值
 * @returns 转换后的 provider 或 undefined
 */
function asProviderDefault(value: unknown): ProviderDefault | undefined {
  if (value === 'auto' || value === 'mock' || value === 'openai') {
    return value
  }
  return undefined
}

/**
 * 将未知值转换为字符串数组
 * @param value 待转换的值
 * @returns 转换后的字符串数组或 undefined
 */
function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const normalized: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') {
      return undefined
    }
    normalized.push(item)
  }

  return normalized
}

/**
 * 检查值是否为空对象
 * @param value 待检查的值
 * @returns 是否为空对象
 */
function isEmptyObject(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return Object.keys(value as Record<string, unknown>).length === 0
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown message handler error.'
}

