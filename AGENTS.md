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
