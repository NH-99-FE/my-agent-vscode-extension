import * as vscode from 'vscode'
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '@agent/types'
import { buildContextFromActiveEditor } from '../context/contextBuilder'
import {
  createLlmClient,
  LlmAbortError,
  LlmCancellationController,
  LlmTimeoutError,
} from '../llm/client'
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
export function registerWebviewMessageHandler(
  panel: vscode.WebviewPanel,
  context: vscode.ExtensionContext,
): vscode.Disposable {
  const sessionStore = new SessionStore(context)
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
          ...(parsedMessage.requestId ? { requestId: parsedMessage.requestId } : {}),
          payload: {
            timestamp: Date.now(),
          },
        })
        break
      case 'chat.send':
        await handleChatSend(panel, parsedMessage, sessionStore, inFlightBySession)
        break
      case 'chat.cancel':
        await handleChatCancel(panel, parsedMessage, inFlightBySession)
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
  sessionStore: SessionStore,
  inFlightBySession: Map<string, InFlightRequest>,
): Promise<void> {
  // 用户连续发送同一会话请求时，先取消旧流，防止并发回包乱序。
  const previous = inFlightBySession.get(message.payload.sessionId)
  previous?.controller.cancel('superseded by a new request')

  const controller = new LlmCancellationController()
  inFlightBySession.set(message.payload.sessionId, {
    controller,
  })

  try {
    // 先落用户消息，保证会话持久化顺序正确。
    await sessionStore.appendUserMessage(message.payload.sessionId, message.payload.text)

    const builtContext = buildContextFromActiveEditor()
    const promptWithContext = composePromptWithContext(message.payload.text, builtContext.snippets)

    const stream = llmClient.streamChat({
      provider: 'mock',
      model: 'mock-gpt',
      sessionId: message.payload.sessionId,
      messages: [{ role: 'user', content: promptWithContext }],
      timeoutMs: 30_000,
      maxRetries: 1,
      retryDelayMs: 200,
      signal: controller.signal,
    })

    // 消费 LLM 流并映射到 Webview 协议事件。
    for await (const event of stream) {
      switch (event.type) {
        case 'text-delta':
          await sessionStore.appendAssistantDelta(message.payload.sessionId, event.delta)
          await postTypedMessage(panel, {
            type: 'chat.delta',
            ...(message.requestId ? { requestId: message.requestId } : {}),
            payload: {
              sessionId: message.payload.sessionId,
              textDelta: event.delta,
            },
          })
          break
        case 'done':
          await postTypedMessage(panel, {
            type: 'chat.done',
            ...(message.requestId ? { requestId: message.requestId } : {}),
            payload: {
              sessionId: message.payload.sessionId,
              finishReason: event.finishReason,
            },
          })
          break
        case 'error':
          await sessionStore.appendAssistantError(message.payload.sessionId, event.message)
          await postTypedMessage(panel, {
            type: 'chat.error',
            ...(message.requestId ? { requestId: message.requestId } : {}),
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
        ...(message.requestId ? { requestId: message.requestId } : {}),
        payload: {
          sessionId: message.payload.sessionId,
          finishReason: 'cancelled',
        },
      })
      return
    }

    if (error instanceof LlmTimeoutError) {
      // 超时作为错误上报，并落库到会话。
      await sessionStore.appendAssistantError(message.payload.sessionId, error.message)
      await postTypedMessage(panel, {
        type: 'chat.error',
        ...(message.requestId ? { requestId: message.requestId } : {}),
        payload: {
          sessionId: message.payload.sessionId,
          message: error.message,
        },
      })
      return
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown chat error.'
    await sessionStore.appendAssistantError(message.payload.sessionId, errorMessage)
    await postTypedMessage(panel, {
      type: 'chat.error',
      ...(message.requestId ? { requestId: message.requestId } : {}),
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
  inFlightBySession: Map<string, InFlightRequest>,
): Promise<void> {
  const inFlight = inFlightBySession.get(message.payload.sessionId)
  if (!inFlight) {
    await postSystemError(panel, `No running request for session ${message.payload.sessionId}.`, message.requestId)
    return
  }

  // 取消后由上游 catch 统一转换为 done(cancelled) 响应。
  inFlight.controller.cancel('cancelled by user')
}

function composePromptWithContext(
  userText: string,
  snippets: Array<{ source: string; filePath: string; content: string }>,
): string {
  if (snippets.length === 0) {
    return userText
  }

  const contextBlock = snippets
    .map((snippet, index) => {
      return [
        `### Context ${index + 1}`,
        `source: ${snippet.source}`,
        `file: ${snippet.filePath}`,
        '```',
        snippet.content,
        '```',
      ].join('\n')
    })
    .join('\n\n')

  return [`User request:\n${userText}`, `Attached context:\n${contextBlock}`].join('\n\n')
}

/**
 * 统一系统错误消息出口，后续可在这里接入 telemetry。
 */
async function postSystemError(
  panel: vscode.WebviewPanel,
  message: string,
  requestId?: string,
): Promise<void> {
  await postTypedMessage(panel, {
    type: 'system.error',
    ...(requestId ? { requestId } : {}),
    payload: { message },
  })
}

/**
 * 统一发送扩展到前端消息，保持发送侧类型收敛。
 */
async function postTypedMessage(
  panel: vscode.WebviewPanel,
  message: ExtensionToWebviewMessage,
): Promise<void> {
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
      const pingMessage: WebviewToExtensionMessage = {
        type: 'ping',
        ...(maybeMessage.requestId ? { requestId: maybeMessage.requestId } : {}),
        ...(parsedPayload ? { payload: parsedPayload } : {}),
      }
      return pingMessage
    }
    case 'chat.send': {
      if (typeof maybeMessage.payload !== 'object' || maybeMessage.payload === null) {
        return undefined
      }
      const payload = maybeMessage.payload as Record<string, unknown>
      if (typeof payload.sessionId !== 'string' || typeof payload.text !== 'string') {
        return undefined
      }
      const chatSendMessage: WebviewToExtensionMessage = {
        type: 'chat.send',
        ...(maybeMessage.requestId ? { requestId: maybeMessage.requestId } : {}),
        payload: {
          sessionId: payload.sessionId,
          text: payload.text,
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
        ...(maybeMessage.requestId ? { requestId: maybeMessage.requestId } : {}),
        payload: {
          sessionId: payload.sessionId,
        },
      }
      return chatCancelMessage
    }
    default:
      return undefined
  }
}

function asOptionalObjectWithOptionalNumberTimestamp(
  value: unknown,
): { timestamp?: number } | undefined {
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
