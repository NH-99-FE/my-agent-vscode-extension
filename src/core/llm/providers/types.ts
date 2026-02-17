import type { LlmProvider, LlmStreamEvent, LlmStreamRequest } from '../client'

export interface ProviderAdapter {
  streamChat(request: LlmStreamRequest): AsyncGenerator<LlmStreamEvent>
}

export interface ProviderRegistration {
  adapter: ProviderAdapter
  supportsModel(model: string): boolean
}

export interface ProviderRegistry {
  getAdapter(provider: LlmProvider, model: string): ProviderAdapter
}
