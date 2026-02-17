import type { ProviderDefault } from '@agent/types'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

type SettingsPanelProps = {
  providerDefault: ProviderDefault
  openaiBaseUrl: string
  defaultModel: string
  modelsText: string
  apiKeyInput: string
  hasOpenAiApiKey: boolean
  loading: boolean
  saving: boolean
  error: string | null
  onProviderDefaultChange: (providerDefault: ProviderDefault) => void
  onOpenaiBaseUrlChange: (value: string) => void
  onDefaultModelChange: (value: string) => void
  onModelsTextChange: (value: string) => void
  onApiKeyInputChange: (value: string) => void
  onRefresh: () => void
  onSaveSettings: () => void
  onSaveApiKey: () => void
  onDeleteApiKey: () => void
  onClose: () => void
}

export const SettingsPanel = ({
  providerDefault,
  openaiBaseUrl,
  defaultModel,
  modelsText,
  apiKeyInput,
  hasOpenAiApiKey,
  loading,
  saving,
  error,
  onProviderDefaultChange,
  onOpenaiBaseUrlChange,
  onDefaultModelChange,
  onModelsTextChange,
  onApiKeyInputChange,
  onRefresh,
  onSaveSettings,
  onSaveApiKey,
  onDeleteApiKey,
  onClose,
}: SettingsPanelProps) => {
  const disableActions = loading || saving

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-card-foreground shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">设置</h3>
        <button
          type="button"
          className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          aria-label="关闭设置面板"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <label className="block text-xs text-muted-foreground">
          Provider
          <select
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={providerDefault}
            onChange={event => onProviderDefaultChange(event.target.value as ProviderDefault)}
            disabled={disableActions}
          >
            <option value="auto">auto</option>
            <option value="mock">mock</option>
            <option value="openai">openai</option>
          </select>
        </label>

        <label className="block text-xs text-muted-foreground">
          OpenAI Base URL
          <input
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={openaiBaseUrl}
            onChange={event => onOpenaiBaseUrlChange(event.target.value)}
            placeholder="https://api.openai.com/v1"
            disabled={disableActions}
          />
        </label>

        <label className="block text-xs text-muted-foreground">
          默认模型
          <input
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={defaultModel}
            onChange={event => onDefaultModelChange(event.target.value)}
            placeholder="例如: ZhipuAI/GLM-5"
            disabled={disableActions}
          />
        </label>

        <label className="block text-xs text-muted-foreground">
          可选模型列表（每行一个）
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            value={modelsText}
            onChange={event => onModelsTextChange(event.target.value)}
            placeholder={'例如:\nZhipuAI/GLM-5\nQwen/Qwen3-Coder-480B-A35B-Instruct'}
            disabled={disableActions}
          />
        </label>

        <div className="text-xs">
          <span className="text-muted-foreground">OpenAI API Key 状态：</span>
          <span className={hasOpenAiApiKey ? 'text-green-600' : 'text-muted-foreground'}>{hasOpenAiApiKey ? '已配置' : '未配置'}</span>
        </div>

        <label className="block text-xs text-muted-foreground">
          OpenAI API Key
          <input
            type="password"
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            value={apiKeyInput}
            onChange={event => onApiKeyInputChange(event.target.value)}
            placeholder="sk-..."
            disabled={disableActions}
          />
        </label>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {loading ? <p className="text-xs text-muted-foreground">正在读取设置...</p> : null}
        {saving ? <p className="text-xs text-muted-foreground">正在保存...</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onRefresh} disabled={disableActions}>
            刷新
          </Button>
          <Button size="sm" onClick={onSaveSettings} disabled={disableActions}>
            保存设置
          </Button>
          <Button size="sm" variant="secondary" onClick={onSaveApiKey} disabled={disableActions || apiKeyInput.trim().length === 0}>
            保存 Key
          </Button>
          <Button size="sm" variant="destructive" onClick={onDeleteApiKey} disabled={disableActions || !hasOpenAiApiKey}>
            删除 Key
          </Button>
        </div>
      </div>
    </div>
  )
}
