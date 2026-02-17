import type { LlmProvider } from './client'

export class LlmAbortError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmAbortError'
  }
}

export class LlmTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmTimeoutError'
  }
}

export type LlmProviderErrorCode =
  | 'auth_failed'
  | 'rate_limited'
  | 'timeout'
  | 'network_error'
  | 'unknown_provider'
  | 'unknown_model'
  | 'invalid_request'
  | 'provider_unavailable'

export class LlmProviderError extends Error {
  readonly code: LlmProviderErrorCode
  readonly provider: string
  readonly retryable: boolean
  readonly statusCode?: number

  constructor(params: { code: LlmProviderErrorCode; provider: string; message: string; retryable: boolean; statusCode?: number }) {
    super(params.message)
    this.name = 'LlmProviderError'
    this.code = params.code
    this.provider = params.provider
    this.retryable = params.retryable
    if (typeof params.statusCode === 'number') {
      this.statusCode = params.statusCode
    }
  }
}

export function createUnknownProviderError(provider: string): LlmProviderError {
  return new LlmProviderError({
    code: 'unknown_provider',
    provider,
    retryable: false,
    message: `Unsupported provider "${provider}".`,
  })
}

export function createUnknownModelError(provider: LlmProvider, model: string): LlmProviderError {
  return new LlmProviderError({
    code: 'unknown_model',
    provider,
    retryable: false,
    message: `Model "${model}" is not supported by provider "${provider}".`,
  })
}

export function formatLlmProviderError(error: LlmProviderError): string {
  // 统一为稳定前缀，便于前端做规则匹配与可观测日志检索。
  return `[provider:${error.provider}][code:${error.code}] ${error.message}`
}
