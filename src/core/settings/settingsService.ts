import type { ProviderDefault } from '@agent/types'
import * as vscode from 'vscode'
import { deleteOpenAIApiKey, hasOpenAIApiKey, setOpenAIApiKey } from '../storage/secrets'

// 设置状态接口
export interface SettingsState {
  providerDefault: ProviderDefault // 默认 provider
  openaiBaseUrl: string // OpenAI 基础 URL
  hasOpenAiApiKey: boolean // 是否有 OpenAI API Key
  openaiDefaultModel: string // OpenAI 默认模型
  openaiModels: string[] // OpenAI 可用模型列表
}

// 设置更新输入接口
export interface SettingsUpdateInput {
  providerDefault?: ProviderDefault // 默认 provider
  openaiBaseUrl?: string // OpenAI 基础 URL
  openaiDefaultModel?: string // OpenAI 默认模型
  openaiModels?: string[] // OpenAI 可用模型列表
}

/**
 * 设置服务类
 * 负责管理扩展设置的读取和更新
 */
export class SettingsService {
  /**
   * 构造函数
   * @param context VS Code 扩展上下文
   */
  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * 获取当前设置状态
   * @returns 设置状态对象
   */
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

  /**
   * 更新设置
   * @param input 设置更新输入
   * @returns 更新后的设置状态
   */
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

  /**
   * 设置 OpenAI API Key
   * @param apiKey API Key
   * @returns 更新后的设置状态
   */
  async setOpenAiApiKey(apiKey: string): Promise<SettingsState> {
    await setOpenAIApiKey(this.context, apiKey)
    return this.getState()
  }

  /**
   * 删除 OpenAI API Key
   * @returns 更新后的设置状态
   */
  async deleteOpenAiApiKey(): Promise<SettingsState> {
    await deleteOpenAIApiKey(this.context)
    return this.getState()
  }
}

/**
 * 从配置中获取默认 provider
 * @returns 默认 provider 配置值
 */
function getProviderDefaultFromConfig(): ProviderDefault {
  const configured = vscode.workspace.getConfiguration('agent').get<string>('provider.default', 'auto')
  if (configured === 'auto' || configured === 'mock' || configured === 'openai') {
    return configured
  }
  return 'auto'
}

/**
 * 从配置中获取 OpenAI 基础 URL
 * @returns OpenAI 基础 URL
 */
function getOpenAiBaseUrlFromConfig(): string {
  const configured = vscode.workspace.getConfiguration('agent').get<string>('openai.baseUrl', '')
  return typeof configured === 'string' ? configured.trim() : ''
}

/**
 * 从配置中获取 OpenAI 默认模型
 * @returns OpenAI 默认模型名称
 */
function getOpenAiDefaultModelFromConfig(): string {
  const configured = vscode.workspace.getConfiguration('agent').get<string>('openai.defaultModel', 'gpt-4o-mini')
  return typeof configured === 'string' ? configured.trim() : 'gpt-4o-mini'
}

/**
 * 从配置中获取 OpenAI 模型列表
 * @returns OpenAI 模型列表
 */
function getOpenAiModelsFromConfig(): string[] {
  const configured = vscode.workspace.getConfiguration('agent').get<unknown>('openai.models', ['gpt-4o-mini'])
  if (!Array.isArray(configured)) {
    return ['gpt-4o-mini']
  }
  const normalized = normalizeModelList(configured)
  return normalized.length > 0 ? normalized : ['gpt-4o-mini']
}

/**
 * 规范化模型列表，去除重复项和空值
 * @param models 原始模型列表
 * @returns 规范化后的模型列表
 */
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
