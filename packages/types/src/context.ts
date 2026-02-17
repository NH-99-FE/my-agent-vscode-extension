// 上下文片段来源类型
// 用于标识该片段是从哪类采集器抽取的，方便做权重与调试
export type ContextSource =
  | 'activeEditor' // 活动编辑器
  | 'selection' // 选中内容
  | 'openTabs' // 打开的标签页
  | 'workspaceSearch' // 工作区搜索
  | 'diagnostics' // 诊断信息

// 注入到模型中的最小上下文片段
export interface ContextSnippet {
  id: string // 片段唯一 ID，用于去重与追踪
  source: ContextSource // 上下文来源
  filePath: string // 工作区相对路径或绝对路径（按实现约定）
  languageId: string // 语言标识符
  content: string // 片段原始文本内容
  startLine: number // 起始行号
  endLine: number // 结束行号
}

// 一次上下文构建结果
export interface BuiltContext {
  snippets: ContextSnippet[] // 上下文片段列表
}

// 单条聊天消息结构
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' // 消息角色
  content: string // 消息内容
  timestamp: number // Unix 毫秒时间戳
}

// 会话聚合结构，供持久化与恢复使用
export interface ChatSession {
  id: string // 会话唯一标识
  title: string // 会话标题
  createdAt: number // 创建时间戳
  updatedAt: number // 更新时间戳
  messages: ChatMessage[] // 消息列表
}
