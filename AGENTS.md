# Repository Guidelines

## 项目结构与模块组织

本仓库是一个 pnpm workspace，主要包含三部分：

- `src/`：VS Code 扩展后端代码（入口为 `src/extension.ts`，核心模块位于 `src/core/`）。
- `packages/types/`：内部共享的 TypeScript 类型包（`@agent/types`）。
- `webview-ui/`：基于 React + Vite 的 webview 前端（源码在 `src/`，静态资源在 `public/`，产物在 `dist/`）。
- `scripts/`：构建辅助脚本（如 `build-extension.mjs`、`copy-webview.mjs`）。
- `media/`：扩展打包使用的静态资源。

请将后端逻辑放在 `src/core/*`，共享协议/类型放在 `packages/types/src/*`，纯前端代码放在 `webview-ui/src/*`。

## 构建、测试与开发命令

除特别说明外，以下命令均在仓库根目录执行：

- `pnpm install`：安装工作区依赖。
- `pnpm dev:web`：启动 `webview-ui` 的 Vite 开发服务器。
- `pnpm build:web`：构建 webview 前端。
- `pnpm build:types`：构建共享类型包。
- `pnpm typecheck`：通过 Turbo 执行工作区 TypeScript 类型检查。
- `pnpm build`：完整构建（Turbo 构建 + 复制前端产物 + 打包扩展）。
- `pnpm -C webview-ui lint`：对前端 TS/React 代码执行 ESLint。
- `pnpm vsce:package`：生成 VSIX 安装包。

## 代码风格与命名约定

- 语言：TypeScript（`tsconfig.base.json` 开启 `strict`）。
- 现有风格：2 空格缩进、单引号、允许时保留尾随逗号。
- 文件命名：模块文件使用 `camelCase`（如 `messageHandler.ts`）；React 组件使用 `PascalCase`（如 `App.tsx`）。
- 共享类型导出统一放在 `packages/types/src/`。

## 测试规范

当前仓库尚未配置自动化测试框架。新增框架前，最低质量门槛为：

1. `pnpm typecheck`
2. `pnpm -C webview-ui lint`
3. 手动冒烟验证 webview 与扩展构建（`pnpm build`）

后续新增测试时，建议将 `*.test.ts` / `*.test.tsx` 与被测代码就近放置。

## 提交与 Pull Request 规范

当前快照缺少 `.git` 元数据，无法从历史中推断现有提交风格。建议统一使用 Conventional Commits（例如：`feat: add webview message router`）。

提交 PR 时请包含：

- 对用户可见改动与内部改动的清晰说明。
- 关联的任务或 Issue 编号（如适用）。
- `webview-ui` 相关 UI 变更的截图或短录屏。
- 验证记录（列出已执行命令，如 typecheck、lint、build）。

## 当前实现进展（后端）

截至当前，后端主线已完成第 1-6 步的骨架实现，重点如下：

- 扩展入口与命令激活：已实现 `agent.openChat`，可激活扩展并打开面板。
- Webview 面板层：已实现面板创建/复用、`media/index.html` 注入、静态资源路径改写、CSP 注入与 fallback 页面。
- 消息协议层：已在 `packages/types/src/messages.ts` 定义 Webview <-> Extension 协议，包含 `ping`、`chat.send`、`chat.cancel`、`chat.delta`、`chat.done`、`chat.error`、`system.ready`、`system.error`，并新增上下文文件选择通道 `context.files.pick`、`context.files.picked`。其中 `chat.send` 已扩展并收敛字段：`model`、`reasoningLevel`、`attachments`。
- 设置/会话协议层：已新增 `settings.get`、`settings.update`、`settings.apiKey.set`、`settings.apiKey.delete`、`chat.session.create` 入站消息，以及 `settings.state`、`chat.session.created` 出站消息。
- 消息路由层：`messageHandler` 已实现入站消息严格校验、类型分发、统一错误回包；`chat.send` 新字段已纳入 runtime 严格校验与 requestId 透传。`context.files.pick/picked` 已补齐 requestId 显式透传约束（按字段存在与否透传，不依赖 truthy）。
- LLM 流式层：已完成 provider 抽象（adapter + registry + 统一错误归一化），并接入 `mock/openai` 双通道，支持流式输出事件（delta/done/error）。
- 运行控制：已支持同会话并发覆盖、用户取消（`chat.cancel`）、超时、重试。
- 服务边界：已新增 `ChatService`，将 chat 请求组装、上下文拼装、会话写入与流式消费从 handler 下沉。
- 设置服务：已新增 `SettingsService`，统一承接 provider/default 与 openai/baseUrl 配置读写，以及 OpenAI API Key 的 set/delete/has 状态回传。
- 上下文构建：已实现基于活动编辑器的最小上下文采集（全文 + 选区，含截断策略），并新增附件上下文读取与拼装（文本读取、截断、二进制识别、失败跳过）。
- 会话存储：已实现基于 `workspaceState` 的会话持久化（用户消息、助手增量、错误写入）。
- 会话创建：已新增 `chat.session.create` 后端能力，可生成并返回新 `sessionId`，并更新 active session 语义。
- 密钥存储：已实现基于 `SecretStorage` 的 API Key 管理（set/get/has/delete）。
- Provider 请求参数：前端传入的 `model` 与 `reasoningLevel` 已下传到 provider 请求结构；OpenAI 适配中 `reasoningLevel=ultra` 映射为 `high`，其余档位原样透传。
- Provider 选择策略：后端已支持 `agent.provider.default`（`auto|mock|openai`）配置与模型映射（`mock-*` -> mock，`gpt-*` -> openai）。

当前后端可用状态：

- 可完整打通 `chat.send -> 流式 delta -> done/error` 链路。
- 可在 `chat.send` 中携带模型、推理强度、附件上下文并完成后端消费。
- 可通过后端配置切换到 OpenAI 并保持协议输出不变（`chat.delta/chat.done/chat.error`）。
- 可通过 `settings.get/settings.update/settings.apiKey.*` 完成设置面板所需后端状态读取与更新闭环。
- 可通过 `chat.session.create` 返回新会话 ID 用于前端“新会话”入口。
- 可对进行中的会话请求执行取消。
- 可在后端保存并更新会话内容。

## 当前实现进展（前端）

截至当前，前端主线已完成聊天页核心交互骨架与 P0 真实发送闭环，重点如下：

- 通信桥接层：`webview-ui/src/lib/bridge.ts` 与共享协议联动，支持基础聊天消息与上下文文件选择回包类型校验。
- Composer 基础交互：输入区自适应高度、模型选择与推理强度选择（基于通用 `OptionSelect`）已可用，且模型/推理下拉已改为受控同步，切换会话时展示与 store 保持一致。
- 真实发送链路：`chat.send` 已按 `@agent/types` 严格发送 `text + model + reasoningLevel + attachments + sessionId`。
- 发送逻辑收敛：Composer 内的协议组装与回包处理已下沉到 `features/thread` 的 service/store（Zustand）。
- 会话隔离：已按 `sessionId` 维护 draft（text/model/reasoningLevel/attachments/inlineNotice）与发送态，切换会话不串状态。
- 附件行为：`chat.done` 的 `stop/length` 成功态清空附件，`chat.error` 与 `cancelled/error` 不清空。
- 附件回包关联：`context.files.pick/picked` 已接入 `requestId` 关联与前端 pending 映射，回包优先落回发起会话。
- 基础 UX：无输入且无附件时禁用发送；发送中禁用重复发送；附件超上限提供 Composer 内联提示。
- 历史记录搜索卡片：`HistorySearchCard` 已基于 shadcn `Command` 组件实现，支持搜索、列表展示、悬停删除、外部点击关闭。
- 顶部栏与列表联动：支持通过“历史记录”图标与“查看全部”入口打开同一历史卡片，并在 thread/detail 页面复用。

## 前后端分工开发计划（并行会话版）

以下内容用于前端会话与后端会话并行推进时的对齐基线，按「已完成 / 代办 / 注意事项」维护。

### 一、前端（Webview UI）分工

#### 1) 已完成

- `Composer` 已具备输入区、模型选择、推理强度选择、发送按钮基础 UI。
- 已实现 `AddContextFiles` 附件区组件（添加后展示 chip、删除、自动换行）。
- 已接入附件选择触发：点击 `+` 发送 `context.files.pick` 请求。
- 已接入附件结果消费：监听 `context.files.picked` 回包并写入本地附件状态（去重、上限 20），并通过 `requestId` + pending map 关联回发起会话。
- 已打通真实发送链路：`chat.send` 严格携带 `text/model/reasoningLevel/attachments/sessionId`。
- 已将发送链路与回包处理下沉至 `features/thread` 的 service/store（Zustand），减少 `Composer` 膨胀。
- 已完成会话隔离：按 `sessionId` 维护 draft 与 sending 状态，避免切换会话串状态与发送态悬挂。
- 已完成附件清理规则：仅 `chat.done(stop|length)` 清空，`chat.error` 与 `chat.done(cancelled|error)` 保留。
- 已完成基础发送 UX：无输入且无附件禁用发送；发送中禁用重复发送；附件超上限显示内联提示。
- 已完成模型/推理选择显示同步：`OptionSelect` 支持受控值，切换会话展示不漂移。
- 历史卡片 `HistorySearchCard` 已实现 `Command` 搜索、悬停删除、外部点击关闭。
- 顶部栏历史图标与“查看全部”入口已联动打开历史卡片。

#### 2) 代办

- 完成会话维度状态管理收敛：
  - 历史记录点击后恢复对应会话上下文。
- 错误态体验补齐：
  - 文件读取失败提示、provider 不可用提示。
- 历史卡片数据源从 mock 切换到真实会话数据。

#### 3) 注意事项

- 前端不得直接依赖扩展内部实现，所有通信必须通过 `@agent/types` 协议消息。
- `bridge.onMessage` 必须在 `useEffect` 中返回 dispose，避免重复监听。
- `Composer` 当前已有较多状态，新增逻辑优先抽离到 `features/thread` 的服务层，避免组件继续膨胀。
- 附件“发送成功后清空”仅在成功完成时触发（`chat.done` 的成功结束态），取消/错误保留。

### 二、后端（Extension Core）分工

#### 1) 已完成

- Webview 消息路由与严格解析已落地，支持 `ping/chat.send/chat.cancel`。
- `chat.send` 协议扩展与消费已落地：
  - 入站新增 `model`、`reasoningLevel`、`attachments` 严格校验
  - `model/reasoningLevel` 已下传 provider 请求参数
  - 附件内容已纳入上下文构建与 prompt 组装（失败文件按“部分成功继续”策略跳过）
- 已新增文件选择通道处理：
  - 处理 `context.files.pick`
  - 调用 `vscode.window.showOpenDialog`
  - 回包 `context.files.picked` 并透传同一 `requestId`（用于前端 pending map 稳定命中）
- 已新增设置与会话创建通道处理：
  - 处理 `settings.get/settings.update/settings.apiKey.set/settings.apiKey.delete`
  - 回包 `settings.state`（`providerDefault/openaiBaseUrl/hasOpenAiApiKey`）
  - 处理 `chat.session.create` 并回包 `chat.session.created`
- LLM 流式链路已打通（mock provider），支持 delta/done/error、取消、超时、重试。
- 已完成 Provider 抽象层：
  - `ProviderAdapter` 接口与 `ProviderRegistry` 已落地（含 provider/model 校验）
  - 错误已统一归一化（鉴权/限流/超时/网络/unknown provider|model）
- 已完成 OpenAI 首接入（流式）：
  - 保持协议输出不变（`chat.delta/chat.done/chat.error`）
  - `model/reasoningLevel` 已真实下传到 OpenAI 请求参数
  - requestId 在消息链路继续透传（按字段存在透传）
- `ChatService` 已新增并接入主链路，handler 维持轻量路由职责。
- `SettingsService` 与 `SessionService` 已新增，业务逻辑继续从 handler 下沉。
- 会话持久化与密钥管理已有基础实现（`SessionStore`、`SecretStorage`）。

#### 2) 代办

- 扩展到第二家 provider（Anthropic）并复用现有 adapter/registry 抽象。
- 完善会话服务边界：
  - 将会话查询、更新、恢复等非发送路径从 handler/调用点进一步收敛到 service 层。
- 增加协议与 handler 回归测试（重点覆盖 parseInboundMessage 与异常分支）。

#### 3) 注意事项

- `messageHandler` 继续保持“路由层”职责，业务逻辑优先下沉 service，避免单文件变成 God object。
- 新增协议字段时必须同步：
  - `packages/types/src/messages.ts`
  - `packages/types/src/index.ts`
  - `webview-ui/src/lib/bridge.ts` runtime 白名单（如涉及 extension -> webview 新消息）
- 所有新增消息都要有 requestId 透传策略，便于前端做请求级关联。
- `context.files.pick/picked` 需固定执行 requestId 回传约束：只要入站消息带 `requestId` 字段，回包必须透传同值（避免退回前端 fallback 分支）。

### 三、前后端协同约定

- 协议变更顺序：先改 `@agent/types`，再分别改前后端实现，最后更新 `bridge.README.md` 与本文档。
- 并行开发时每个阶段至少保证以下可回归命令通过：
  1. `pnpm -C packages/types typecheck`
  2. `pnpm -C webview-ui typecheck`
  3. `pnpm typecheck:ext`
- 若出现类型解析问题（如 `@agent/types`），优先检查各子工程 `tsconfig` 的 `paths` 对齐，不要在业务代码里绕过类型系统。
- 严格遵守高内聚低耦合：
  - UI 组件只处理展示和交互，不承载协议编排细节。
  - 扩展消息处理层只做校验和路由，不直接承载 provider 细节。
  - provider 能力通过抽象接口注册，不把供应商 SDK 细节泄漏到上层。

当前未完成项（有意留待后续）：

- 第二家真实模型 provider 接入（Anthropic）。
- 工具调用层（tool registry / tool executor）。
- 更完整的上下文来源（workspace 搜索、诊断、git diff 等）。
- 前端真实发送链路接入（将输入内容与上下文文件选择结果串到完整会话流）。
- 自动化测试框架与回归用例。
