/**
 * 上下文片段来源类型。
 * 用于标识该片段是从哪类采集器抽取的，方便做权重与调试。
 */
export type ContextSource =
  | 'activeEditor'
  | 'selection'
  | 'openTabs'
  | 'workspaceSearch'
  | 'diagnostics'

/**
 * 注入到模型中的最小上下文片段。
 */
export interface ContextSnippet {
  /**
   * 片段唯一 ID，用于去重与追踪。
   */
  id: string
  source: ContextSource
  /**
   * 工作区相对路径或绝对路径（按实现约定）。
   */
  filePath: string
  languageId: string
  /**
   * 片段原始文本内容。
   */
  content: string
  startLine: number
  endLine: number
}

/**
 * 一次上下文构建结果。
 */
export interface BuiltContext {
  snippets: ContextSnippet[]
}

/**
 * 单条聊天消息结构。
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /**
   * Unix 毫秒时间戳。
   */
  timestamp: number
}

/**
 * 会话聚合结构，供持久化与恢复使用。
 */
export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}
