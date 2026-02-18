import type { ProviderDefault } from '@agent/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { KeyRound, LoaderCircle, RefreshCcw, Save, Settings2, Trash2, X } from 'lucide-react'

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
    <div className="flex max-h-120 flex-col rounded-xl border border-border bg-card p-3 text-card-foreground shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">设置</h3>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="关闭设置面板"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <div className="mt-3 space-y-3 overflow-y-auto pr-1">
        <section className="space-y-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground">模型与 Provider</p>

          <div className="space-y-1.5">
            <Label htmlFor="settings-provider" className="text-xs font-medium text-muted-foreground">
              Provider
            </Label>
            <Select
              value={providerDefault}
              onValueChange={value => onProviderDefaultChange(value as ProviderDefault)}
              disabled={disableActions}
            >
              <SelectTrigger
                id="settings-provider"
                size="sm"
                className="h-8 w-full border-border bg-input text-sm shadow-none dark:bg-input"
              >
                <SelectValue placeholder="选择 Provider" />
              </SelectTrigger>
              <SelectContent align="start" className="border-border/80 bg-popover text-popover-foreground">
                <SelectItem value="auto" className="text-sm">
                  auto
                </SelectItem>
                <SelectItem value="mock" className="text-sm">
                  mock
                </SelectItem>
                <SelectItem value="openai" className="text-sm">
                  openai
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-openai-base-url" className="text-xs font-medium text-muted-foreground">
              OpenAI Base URL
            </Label>
            <Input
              id="settings-openai-base-url"
              className="h-8 border-border bg-input text-sm shadow-none placeholder:text-xs dark:bg-input"
              value={openaiBaseUrl}
              onChange={event => onOpenaiBaseUrlChange(event.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={disableActions}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-default-model" className="text-xs font-medium text-muted-foreground">
              默认模型
            </Label>
            <Input
              id="settings-default-model"
              className="h-8 border-border bg-input text-sm shadow-none placeholder:text-xs dark:bg-input"
              value={defaultModel}
              onChange={event => onDefaultModelChange(event.target.value)}
              placeholder="例如: ZhipuAI/GLM-5"
              disabled={disableActions}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-models-text" className="text-xs font-medium text-muted-foreground">
              可选模型列表（每行一个）
            </Label>
            <div className="rounded-md border border-border bg-input">
              <Textarea
                id="settings-models-text"
                className="h-24 max-h-16 overflow-y-auto py-2 text-sm placeholder:text-xs"
                value={modelsText}
                onChange={event => onModelsTextChange(event.target.value)}
                placeholder={'例如:\nZhipuAI/GLM-5\nQwen/Qwen3-Coder-480B-A35B-Instruct'}
                disabled={disableActions}
              />
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground">密钥管理</p>

          <div className="flex items-center justify-between rounded-md border border-border/70 bg-background px-2.5 py-2">
            <Label className="text-xs font-medium text-muted-foreground">OpenAI API Key 状态</Label>
            <Badge
              variant={hasOpenAiApiKey ? 'secondary' : 'outline'}
              className={hasOpenAiApiKey ? 'text-foreground' : 'text-muted-foreground'}
            >
              {hasOpenAiApiKey ? '已配置' : '未配置'}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settings-api-key" className="text-xs font-medium text-muted-foreground">
              OpenAI API Key
            </Label>
            <Input
              id="settings-api-key"
              type="password"
              className="h-8 border-border bg-input text-sm shadow-none placeholder:text-xs dark:bg-input"
              value={apiKeyInput}
              onChange={event => onApiKeyInputChange(event.target.value)}
              placeholder="sk-..."
              disabled={disableActions}
            />
          </div>
        </section>

        <div className="space-y-1">
          {error ? (
            <p className="rounded-md border border-destructive/35 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">{error}</p>
          ) : null}
          {loading ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              正在读取设置...
            </p>
          ) : null}
          {saving ? (
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              正在保存...
            </p>
          ) : null}
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="secondary" onClick={onRefresh} disabled={disableActions}>
              <RefreshCcw className="h-3.5 w-3.5" />
              刷新
            </Button>
            <Button size="sm" onClick={onSaveSettings} disabled={disableActions}>
              <Save className="h-3.5 w-3.5" />
              保存设置
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={onSaveApiKey} disabled={disableActions || apiKeyInput.trim().length === 0}>
              <KeyRound className="h-3.5 w-3.5" />
              保存 Key
            </Button>
            <Button size="sm" variant="destructive" onClick={onDeleteApiKey} disabled={disableActions || !hasOpenAiApiKey}>
              <Trash2 className="h-3.5 w-3.5" />
              删除 Key
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
