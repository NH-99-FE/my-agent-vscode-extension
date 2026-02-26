# Agent - VS Code 智能编程助手

一个功能完整的 VS Code 扩展，提供 LLM 对话、工具调用、文件上下文管理等 AI 辅助编程功能。

> 项目名称：Scout | 扩展显示名：Agent | 发布者：lianglh

## 功能特性

- 对话式 AI 编程助手 - 支持自然语言交互
- 流式响应 - 实时显示 AI 回复
- 工具调用 - 支持 AI 执行文件读取等操作
- 多会话管理 - 创建、切换、删除会话
- 上下文感知 - 支持活动编辑器、选区、文件等上下文
- 模型选择 - 支持自定义模型和推理强度
- Provider 抽象 - 支持 Mock/OpenAI，易扩展其他 Provider
- 会话持久化 - 跨重启恢复历史对话

## 流式链路与协议约束

### 端到端流式链路

本项目前端接收的不是原始 SSE，而是扩展层转发后的协议消息：

`OpenAI SDK(SSE) -> Extension(AsyncIterator 消费) -> postMessage -> Webview bridge -> gate + buffer -> UI 渲染`

### 关键协议字段（流式消息）

`chat.delta` / `chat.done` / `chat.error` 为强约束流式消息，必须携带：

- 顶层 `requestId`
- `payload.requestId`（必须与顶层一致）
- `payload.turnId`（稳定落点）
- `payload.seq`（同 `requestId` 内单调递增）

### 前端消费规则（防串与一致性）

- `requestId`：判定是否属于当前活跃请求
- `turnId`：将增量精确绑定到当前 turn 对应的 assistant message
- `seq`：去重、防回退、防跳号（gap）
- `cancelling`：取消后忽略后续 delta，仅等待终态收敛
- `rAF` 批量落地：按 message 维度聚合增量，终态前强制 flush，避免 done 后“复活”

## 项目结构

```
my-agent-vscode-extension/
├── src/                    # 扩展后端代码
│   ├── extension.ts        # 扩展入口
│   ├── core/               # 核心业务逻辑
│   │   ├── chat/           # 聊天服务
│   │   ├── context/        # 上下文构建
│   │   ├── llm/            # LLM 客户端
│   │   ├── prompt/         # Prompt 服务
│   │   ├── settings/       # 设置服务
│   │   ├── storage/        # 存储（会话、密钥）
│   │   ├── tools/          # 工具执行器
│   │   └── webview/        # Webview 视图
│
├── packages/               # 内部包
│   └── types/              # 共享类型包 (@agent/types)
│
├── webview-ui/             # 前端 UI (React + Vite)
│   ├── src/
│   │   ├── components/     # UI 组件（common 通用组件、ui shadcn/ui 基础组件）
│   │   ├── features/       # 功能模块（details 会话详情、thread 会话线程）
│   │   │   ├── components/ # 各功能组件
│   │   │   ├── hooks/      # 自定义 Hooks
│   │   │   ├── services/   # 业务服务（消息、会话、工作区、流式处理）
│   │   │   ├── store/      # Zustand 状态管理
│   │   │   └── views/      # 视图组件
│   │   ├── layout/         # 布局组件
│   │   ├── lib/            # 工具库（bridge 通信桥接、utils 通用工具）
│   │   ├── pages/          # 页面组件
│   │   ├── App.tsx         # 应用根组件
│   │   ├── main.tsx        # 应用入口
│   │   ├── router.tsx      # 路由配置
│   │   └── vscode.d.ts     # VS Code API 类型定义
│
├── scripts/                # 构建脚本
│   ├── build-extension.mjs # esbuild 构建扩展
│   └── copy-webview.mjs    # 复制 webview 产物
├── media/                  # 静态资源（扩展打包）
└── turbo.json              # Turbo 构建配置
```

## 技术栈

### 后端

- TypeScript
- VS Code Extension API
- OpenAI API（兼容接口）

### 前端

#### 核心技术

- **React 19.2.0** - UI 框架
- **React Router 7.13.0** - 路由管理（使用 Hash Router 避免与 index.html 冲突）
- **Vite 7.3.1 + SWC** - 快速构建工具
- **Zustand 5.0.11** - 轻量级状态管理

#### UI 组件与样式

- **shadcn/ui + Tailwind CSS 4.1.18** - UI 组件库与样式方案
- **Radix UI** - 无障碍 UI 原语基础
- **lucide-react** - 图标库
- **class-variance-authority** - 组件样式变体管理

#### 功能增强

- **react-markdown + remark-gfm** - Markdown 渲染，支持 GitHub Flavored Markdown
- **@tanstack/react-virtual** - 虚拟滚动，处理大量历史消息
- **react-resizable-panels** - 可调整大小面板

## 配置

### VS Code 配置项

| 配置项                      | 类型   | 默认值        | 说明                            |
| --------------------------- | ------ | ------------- | ------------------------------- |
| `agent.provider.default`    | enum   | auto          | Provider 模式：auto/mock/openai |
| `agent.openai.baseUrl`      | string | ""            | OpenAI 兼容网关地址             |
| `agent.openai.defaultModel` | string | gpt-4o-mini   | 默认模型                        |
| `agent.openai.models`       | array  | [gpt-4o-mini] | 推荐模型列表                    |

### 使用设置面板

通过扩展内设置面板可以配置：

- Provider 选择（自动/Mock/OpenAI）
- OpenAI API URL
- OpenAI API Key（安全存储）
- 模型列表

## 命令

| 命令             | 说明                |
| ---------------- | ------------------- |
| `agent.openChat` | 打开 Agent 聊天窗口 |

## 开发

### 环境要求

- Node.js
- pnpm 10.23.0+
- VS Code 1.96.0+

### 安装依赖

```bash
pnpm install
```

### 开发

```bash
# 开发 Webview UI
pnpm dev:web
```

### 构建

```bash
# 完整构建
pnpm build

# 分步构建
pnpm build:ws      # 构建工作区（Turbo 并行构建）
pnpm copy:web      # 复制 webview 产物
pnpm build:ext     # 打包扩展
```

### 类型检查

```bash
pnpm typecheck
```

### 代码检查与格式化

```bash
pnpm lint          # ESLint
pnpm format        # Prettier
```

### 打包扩展

```bash
pnpm vsce:package
```

## 核心模块说明

### ChatService (`src/core/chat/chatService.ts`)

- 组装 LLM 请求参数
- 构建会话消息历史
- 处理工具调用（每轮最多 5 次）
- 流式消费 LLM 回复并增量写入存储

### LLM Client (`src/core/llm/client.ts`)

- Provider 抽象层
- 流式事件处理
- 硬超时 + 空闲超时双保险
- 自动重试机制

### Tool System (`src/core/tools/`)

- `readFileByPathTool` - 读取工作区内文件内容
- 支持绝对路径和相对路径
- 二进制文件检测
- 边界检查和字节/字符截断限制

### Storage

- `SessionStore` - 基于 `workspaceState` 的会话持久化
- `SecretStorage` - API Key 安全存储

### 消息协议 (`@agent/types`)

扩展与 Webview 之间定义了完整的消息协议，包括：

**扩展 -> Webview**

- `system.ready` - 系统就绪
- `chat.delta` - 流式文本增量
- `chat.done` - 流式完成
- `context.files.picked` - 文件选择结果
- `settings.state` - 设置状态
- 会话相关消息

**Webview -> 扩展**

- `ping` - 连通性探测
- `chat.send` - 发起聊天
- `chat.cancel` - 取消聊天
- `context.files.pick` - 请求选择文件
- `settings.get/save` - 读取/保存设置
- 会话相关操作

## 工程化

- **Monorepo 架构** - pnpm workspace 共享类型包
- **Turbo** - 高效的并行构建
- **ESLint** - 代码质量检查（Flat Config）
- **Prettier** - 代码格式化
- **Commitlint + cz-git** - 规范化提交
- **Husky + lint-staged** - Git hooks

## License

ISC
