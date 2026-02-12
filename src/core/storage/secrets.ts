import * as vscode from 'vscode'

/**
 * SecretStorage 中的固定键名。
 * 后续支持多 provider 时可继续追加新键。
 */
const SECRET_KEYS = {
  openaiApiKey: 'agent.openai.apiKey',
} as const

export type SecretKey = keyof typeof SECRET_KEYS

/**
 * 统一密钥输入校验：
 * - 去除首尾空白
 * - 禁止空字符串
 */
function normalizeSecret(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('Secret value cannot be empty.')
  }
  return normalized
}

/**
 * 写入 OpenAI API Key 到 VS Code SecretStorage。
 */
export async function setOpenAIApiKey(
  context: vscode.ExtensionContext,
  apiKey: string,
): Promise<void> {
  const normalizedApiKey = normalizeSecret(apiKey)
  await context.secrets.store(SECRET_KEYS.openaiApiKey, normalizedApiKey)
}

/**
 * 读取 OpenAI API Key。
 * 未设置时返回 undefined。
 */
export async function getOpenAIApiKey(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const key = await context.secrets.get(SECRET_KEYS.openaiApiKey)
  return key ?? undefined
}

/**
 * 判断 OpenAI API Key 是否存在。
 */
export async function hasOpenAIApiKey(context: vscode.ExtensionContext): Promise<boolean> {
  const key = await getOpenAIApiKey(context)
  return typeof key === 'string' && key.length > 0
}

/**
 * 删除 OpenAI API Key。
 */
export async function deleteOpenAIApiKey(context: vscode.ExtensionContext): Promise<void> {
  await context.secrets.delete(SECRET_KEYS.openaiApiKey)
}
