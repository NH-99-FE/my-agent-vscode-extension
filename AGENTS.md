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
- 消息协议层：已在 `packages/types/src/messages.ts` 定义 Webview <-> Extension 协议，包含 `ping`、`chat.send`、`chat.cancel`、`chat.delta`、`chat.done`、`chat.error`、`system.ready`、`system.error`，并新增上下文文件选择通道 `context.files.pick`、`context.files.picked`。
- 消息路由层：`messageHandler` 已实现入站消息校验、类型分发、统一错误回包。
- LLM 流式层：已实现最小可用 `LlmClient`（当前 `mock` provider），支持流式输出事件（delta/done/error）。
- 运行控制：已支持同会话并发覆盖、用户取消（`chat.cancel`）、超时、重试。
- 上下文构建：已实现基于活动编辑器的最小上下文采集（全文 + 选区，含截断策略）。
- 会话存储：已实现基于 `workspaceState` 的会话持久化（用户消息、助手增量、错误写入）。
- 密钥存储：已实现基于 `SecretStorage` 的 API Key 管理（set/get/has/delete）。

当前后端可用状态：

- 可完整打通 `chat.send -> 流式 delta -> done/error` 链路。
- 可对进行中的会话请求执行取消。
- 可在后端保存并更新会话内容。

## 当前实现进展（前端）

截至当前，前端主线已完成聊天页核心交互骨架，重点如下：

- 通信桥接层：`webview-ui/src/lib/bridge.ts` 已与共享协议联动，支持基础聊天消息与上下文文件选择回包类型校验。
- Composer 基础交互：已实现输入区自适应高度、模型选择与推理强度选择（基于通用 `OptionSelect`）。
- Tooltip/Select 交互细节：已解决 Select 选中后 tooltip 再次弹出的问题，统一为 hover 优先的交互行为。
- 历史记录搜索卡片：`HistorySearchCard` 已基于 shadcn `Command` 组件实现，支持搜索、列表展示、悬停删除、外部点击关闭。
- 顶部栏与列表联动：支持通过“历史记录”图标与“查看全部”入口打开同一历史卡片，并在 thread/detail 页面复用。
- 上下文文件附件区：已新增 `AddContextFiles` 组件，支持通过扩展侧文件选择器添加、展示为 chip、单项删除、去重与数量上限（20）。
- 附件布局：附件区采用 `flex-wrap` 自动换行，不使用横向滚动条。

当前未完成项（有意留待后续）：

- 真实模型 provider 接入（如 OpenAI/Anthropic）。
- 工具调用层（tool registry / tool executor）。
- 更完整的上下文来源（workspace 搜索、诊断、git diff 等）。
- 前端真实发送链路接入（将输入内容与上下文文件选择结果串到完整会话流）。
- 自动化测试框架与回归用例。
