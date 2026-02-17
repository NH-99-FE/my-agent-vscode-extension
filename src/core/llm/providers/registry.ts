import type { LlmProvider } from '../client'
import { createUnknownModelError, createUnknownProviderError } from '../errors'
import type { ProviderAdapter, ProviderRegistration, ProviderRegistry } from './types'

export class DefaultProviderRegistry implements ProviderRegistry {
  constructor(private readonly providers: Record<LlmProvider, ProviderRegistration>) {}

  getAdapter(provider: LlmProvider, model: string): ProviderAdapter {
    // 第一道守卫：provider 必须存在。
    const registered = this.providers[provider]
    if (!registered) {
      throw createUnknownProviderError(provider)
    }

    // 第二道守卫：模型必须属于该 provider，避免跨 provider 误调用。
    if (!registered.supportsModel(model)) {
      throw createUnknownModelError(provider, model)
    }

    return registered.adapter
  }
}

export function createProviderRegistry(params: { mockAdapter: ProviderAdapter; openAiAdapter: ProviderAdapter }): ProviderRegistry {
  // 模型前缀规则集中管理，后续新增 provider 时只改这里。
  return new DefaultProviderRegistry({
    mock: {
      adapter: params.mockAdapter,
      supportsModel: model => model.startsWith('mock-'),
    },
    openai: {
      adapter: params.openAiAdapter,
      supportsModel: model => model.startsWith('gpt-'),
    },
  })
}
