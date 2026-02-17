import type { ProviderDefault } from '@agent/types'
import * as vscode from 'vscode'
import { deleteOpenAIApiKey, hasOpenAIApiKey, setOpenAIApiKey } from '../storage/secrets'

export interface SettingsState {
  providerDefault: ProviderDefault
  openaiBaseUrl: string
  hasOpenAiApiKey: boolean
  openaiDefaultModel: string
  openaiModels: string[]
}

export interface SettingsUpdateInput {
  providerDefault?: ProviderDefault
  openaiBaseUrl?: string
  openaiDefaultModel?: string
  openaiModels?: string[]
}

export class SettingsService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getState(): Promise<SettingsState> {
    const providerDefault = getProviderDefaultFromConfig()
    const openaiBaseUrl = getOpenAiBaseUrlFromConfig()
    const openaiDefaultModel = getOpenAiDefaultModelFromConfig()
    const openaiModels = getOpenAiModelsFromConfig()
    const hasKey = await hasOpenAIApiKey(this.context)

    return {
      providerDefault,
      openaiBaseUrl,
      hasOpenAiApiKey: hasKey,
      openaiDefaultModel,
      openaiModels,
    }
  }

  async updateSettings(input: SettingsUpdateInput): Promise<SettingsState> {
    const config = vscode.workspace.getConfiguration('agent')

    if (input.providerDefault !== undefined) {
      await config.update('provider.default', input.providerDefault, true)
    }

    if (input.openaiBaseUrl !== undefined) {
      await config.update('openai.baseUrl', input.openaiBaseUrl.trim(), true)
    }
    if (input.openaiDefaultModel !== undefined) {
      await config.update('openai.defaultModel', input.openaiDefaultModel.trim(), true)
    }
    if (input.openaiModels !== undefined) {
      await config.update('openai.models', normalizeModelList(input.openaiModels), true)
    }

    return this.getState()
  }

  async setOpenAiApiKey(apiKey: string): Promise<SettingsState> {
    await setOpenAIApiKey(this.context, apiKey)
    return this.getState()
  }

  async deleteOpenAiApiKey(): Promise<SettingsState> {
    await deleteOpenAIApiKey(this.context)
    return this.getState()
  }
}

function getProviderDefaultFromConfig(): ProviderDefault {
  const configured = vscode.workspace.getConfiguration('agent').get<string>('provider.default', 'auto')
  if (configured === 'auto' || configured === 'mock' || configured === 'openai') {
    return configured
  }
  return 'auto'
}

function getOpenAiBaseUrlFromConfig(): string {
  const configured = vscode.workspace.getConfiguration('agent').get<string>('openai.baseUrl', '')
  return typeof configured === 'string' ? configured.trim() : ''
}

function getOpenAiDefaultModelFromConfig(): string {
  const configured = vscode.workspace.getConfiguration('agent').get<string>('openai.defaultModel', 'gpt-4o-mini')
  return typeof configured === 'string' ? configured.trim() : 'gpt-4o-mini'
}

function getOpenAiModelsFromConfig(): string[] {
  const configured = vscode.workspace.getConfiguration('agent').get<unknown>('openai.models', ['gpt-4o-mini'])
  if (!Array.isArray(configured)) {
    return ['gpt-4o-mini']
  }
  const normalized = normalizeModelList(configured)
  return normalized.length > 0 ? normalized : ['gpt-4o-mini']
}

function normalizeModelList(models: unknown[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const item of models) {
    if (typeof item !== 'string') {
      continue
    }
    const model = item.trim()
    if (!model || seen.has(model)) {
      continue
    }
    seen.add(model)
    result.push(model)
  }

  return result
}
