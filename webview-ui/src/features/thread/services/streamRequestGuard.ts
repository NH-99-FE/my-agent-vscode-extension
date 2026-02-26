export type StreamGateResult = 'matched' | 'ignore' | 'missing_with_active'
export type StreamSequenceGateResult = 'accept' | 'ignore' | 'gap' | 'invalid_seq'
type StreamEventType = 'chat.delta' | 'chat.done' | 'chat.error'
type StreamRequestStatus = 'active' | 'cancelling' | 'closed'

interface StreamRequestState {
  lastSeq: number
  status: StreamRequestStatus
}

export const STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR = '协议错误：回包缺少 requestId，已终止当前请求。'
export const STREAM_PROTOCOL_GAP_ERROR = '协议错误：流式序号不连续，已终止当前请求。'
export const STREAM_PROTOCOL_INVALID_SEQUENCE_ERROR = '协议错误：流式序号非法，已终止当前请求。'
export const STREAM_PROTOCOL_TURN_MISSING_ERROR = '协议错误：未找到 request 对应的回合绑定，已终止当前请求。'
export const STREAM_PROTOCOL_TURN_MISMATCH_ERROR = '协议错误：turnId 与 request 绑定不一致，已终止当前请求。'
export const STREAM_PROTOCOL_REQUEST_ID_MISMATCH_ERROR = '协议错误：payload.requestId 与消息 requestId 不一致。'

const streamRequestStateById = new Map<string, StreamRequestState>()

type StreamRequestGuardActions = {
  isActiveAssistantRequest: (sessionId: string, requestId?: string) => boolean
}

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

function asPositiveInteger(value: number): number | undefined {
  if (!Number.isInteger(value) || value <= 0) {
    return undefined
  }
  return value
}

export function resolveStreamSequenceGate(requestId: string, seq: number, eventType: StreamEventType): StreamSequenceGateResult {
  const state = ensureStreamRequestState(requestId)
  if (state.status === 'closed') {
    return 'ignore'
  }

  if (eventType === 'chat.delta' && state.status === 'cancelling') {
    return 'ignore'
  }

  const normalizedSeq = asPositiveInteger(seq)
  if (normalizedSeq === undefined) {
    state.status = 'closed'
    return 'invalid_seq'
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
