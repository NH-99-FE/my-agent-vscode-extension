// 流式回包 requestId 门禁判定结果
export type StreamGateResult = 'matched' | 'ignore' | 'missing_with_active'

// 协议错误提示：当流式回包缺失 requestId 且当前会话存在 active request 时使用
export const STREAM_PROTOCOL_MISSING_REQUEST_ID_ERROR = '协议错误：回包缺少 requestId，已终止当前请求。'

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
