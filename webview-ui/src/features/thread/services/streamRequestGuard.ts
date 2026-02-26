// 流式回包 requestId 门禁判定结果
export type StreamGateResult = 'matched' | 'ignore' | 'missing_with_active'
export type StreamSequenceGateResult = 'accept' | 'ignore' | 'gap'
type StreamEventType = 'chat.delta' | 'chat.done' | 'chat.error'
type StreamRequestStatus = 'active' | 'cancelling' | 'closed'

interface StreamRequestState {
  lastSeq: number
  status: StreamRequestStatus
}

// 协议错误提示：当流式回包缺失 requestId 且当前会话存在 active request 时使用
export const STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR = '协议错误：回包缺少 requestId，已终止当前请求。'
export const STREAM_PROTOCOL_GAP_ERROR = '协议错误：流式序号不连续，已终止当前请求。'

const streamRequestStateById = new Map<string, StreamRequestState>()

type StreamRequestGuardActions = {
  isActiveAssistantRequest: (sessionId: string, requestId?: string) => boolean
}

/**
 * 统一判定流式回包的 requestId 是否可被当前会话消费。
 * 规则：
 * - requestId 匹配 active request => matched
 * - requestId 不匹配 active request => ignore
 * - requestId 缺失：有 active => missing_with_active；无 active => ignore
 */
export function resolveStreamGate(sessionId: string, requestId: string | undefined, actions: StreamRequestGuardActions): StreamGateResult {
  if (requestId === undefined) {
    return actions.isActiveAssistantRequest(sessionId) ? 'missing_with_active' : 'ignore'
  }
  return actions.isActiveAssistantRequest(sessionId, requestId) ? 'matched' : 'ignore'
}

export function beginStreamRequest(requestId: string): void {
  if (!requestId.trim()) {
    return
  }
  streamRequestStateById.set(requestId, {
    lastSeq: 0,
    status: 'active',
  })
}

export function markStreamRequestCancelling(requestId: string | undefined): void {
  if (!requestId) {
    return
  }
  const current = streamRequestStateById.get(requestId)
  if (!current || current.status === 'closed') {
    return
  }
  current.status = 'cancelling'
}

export function clearStreamRequest(requestId: string | undefined): void {
  if (!requestId) {
    return
  }
  streamRequestStateById.delete(requestId)
}

function ensureStreamRequestState(requestId: string): StreamRequestState {
  const existing = streamRequestStateById.get(requestId)
  if (existing) {
    return existing
  }
  const created: StreamRequestState = {
    lastSeq: 0,
    status: 'active',
  }
  streamRequestStateById.set(requestId, created)
  return created
}

function asPositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined
  }
  return value
}

/**
 * 统一判定流式序号是否可被消费。
 * - seq 缺失/非法：兼容旧协议，按 requestId gate 结果继续消费
 * - seq 重复/回退：忽略
 * - seq 跳号：判定 gap（并将请求状态关闭）
 * - cancelling 状态：delta 直接忽略；done/error 允许收尾
 */
export function resolveStreamSequenceGate(
  requestId: string | undefined,
  seq: number | undefined,
  eventType: StreamEventType
): StreamSequenceGateResult {
  if (!requestId) {
    return 'accept'
  }

  const state = ensureStreamRequestState(requestId)
  if (state.status === 'closed') {
    return 'ignore'
  }

  if (eventType === 'chat.delta' && state.status === 'cancelling') {
    return 'ignore'
  }

  const normalizedSeq = asPositiveInteger(seq)
  if (normalizedSeq === undefined) {
    if (eventType !== 'chat.delta') {
      state.status = 'closed'
    }
    return 'accept'
  }

  if (state.status === 'cancelling' && eventType !== 'chat.delta') {
    if (normalizedSeq > state.lastSeq) {
      state.lastSeq = normalizedSeq
    }
    state.status = 'closed'
    return 'accept'
  }

  const expectedSeq = state.lastSeq + 1
  if (normalizedSeq <= state.lastSeq) {
    return 'ignore'
  }
  if (normalizedSeq > expectedSeq) {
    state.status = 'closed'
    return 'gap'
  }

  state.lastSeq = normalizedSeq
  if (eventType !== 'chat.delta') {
    state.status = 'closed'
  }
  return 'accept'
}
