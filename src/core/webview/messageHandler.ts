import * as vscode from 'vscode'
import type { ChatAttachment, ExtensionToWebviewMessage, ReasoningLevel, WebviewToExtensionMessage } from '@agent/types'
import { ChatService } from '../chat/chatService'
import { createLlmClient, LlmAbortError, LlmCancellationController, LlmTimeoutError } from '../llm/client'
import { SessionStore } from '../storage/sessionStore'

const llmClient = createLlmClient()

interface InFlightRequest {
  controller: LlmCancellationController
}

/**
 * 注册 Webview -> Extension 的消息处理器。
 * 职责：
 * 1. 做基本结构校验（避免异常 payload 导致运行时崩溃）
 * 2. 根据 type 路由到对应处理逻辑
 * 3. 兜底返回统一错误消息
 */
export function registerWebviewMessageHandler(panel: vscode.WebviewPanel, context: vscode.ExtensionContext): vscode.Disposable {
  const sessionStore = new SessionStore(context)
  const chatService = new ChatService(llmClient, sessionStore, context)
  // 同一个 session 只允许一个进行中的请求，新的请求会覆盖并取消旧请求。
  const inFlightBySession = new Map<string, InFlightRequest>()

  return panel.webview.onDidReceiveMessage(async (message: unknown) => {
    const parsedMessage = parseInboundMessage(message)
    if (!parsedMessage) {
      // 非法格式直接返回 system.error，便于前端统一提示。
      await postSystemError(panel, 'Invalid message payload.')
      return
    }

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
        await handleChatCancel(panel, parsedMessage, inFlightBySession)
        break
      case 'context.files.pick':
        await handleContextFilesPick(panel, parsedMessage)
        break
    }
  })
}

/**
 * 处理 chat.send：
 * 1. 组装最小请求参数
 * 2. 消费 LLM 流式事件
 * 3. 映射为协议内 chat.delta/chat.done/chat.error
 */
async function handleChatSend(
  panel: vscode.WebviewPanel,
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
  })

  try {
    const stream = chatService.streamChat(message.payload, controller.signal)

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
  panel: vscode.WebviewPanel,
  message: Extract<WebviewToExtensionMessage, { type: 'chat.cancel' }>,
  inFlightBySession: Map<string, InFlightRequest>
): Promise<void> {
  const inFlight = inFlightBySession.get(message.payload.sessionId)
  if (!inFlight) {
    await postSystemError(panel, `No running request for session ${message.payload.sessionId}.`, message.requestId)
    return
  }

  // 取消后由上游 catch 统一转换为 done(cancelled) 响应。
  inFlight.controller.cancel('cancelled by user')
}

async function handleContextFilesPick(
  panel: vscode.WebviewPanel,
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

/**
 * 统一系统错误消息出口，后续可在这里接入 telemetry。
 */
async function postSystemError(panel: vscode.WebviewPanel, message: string, requestId?: string): Promise<void> {
  await postTypedMessage(panel, {
    type: 'system.error',
    ...(requestId !== undefined ? { requestId } : {}),
    payload: { message },
  })
}

/**
 * 统一发送扩展到前端消息，保持发送侧类型收敛。
 */
async function postTypedMessage(panel: vscode.WebviewPanel, message: ExtensionToWebviewMessage): Promise<void> {
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
      const payload = maybeMessage.payload as Record<string, unknown>
      const sessionId = asNonEmptyString(payload.sessionId)
      const text = asString(payload.text)
      const model = asNonEmptyString(payload.model)
      const reasoningLevel = asReasoningLevel(payload.reasoningLevel)
      const attachments = asAttachments(payload.attachments)
      if (!sessionId || text === undefined || !model || !reasoningLevel || !attachments) {
        return undefined
      }

      const chatSendMessage: WebviewToExtensionMessage = {
        type: 'chat.send',
        ...(maybeMessage.requestId !== undefined ? { requestId: maybeMessage.requestId } : {}),
        payload: {
          sessionId,
          text,
          model,
          reasoningLevel,
          attachments,
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
    default:
      return undefined
  }
}

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

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  return value
}

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

function asReasoningLevel(value: unknown): ReasoningLevel | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'ultra') {
    return value
  }
  return undefined
}

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
