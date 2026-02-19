import type { ChatMessage, ChatSession } from '@agent/types'
import * as vscode from 'vscode'

// 会话列表存储键
const SESSION_LIST_KEY = 'agent.chat.sessions'
// 活跃会话 ID 存储键
const ACTIVE_SESSION_ID_KEY = 'agent.chat.activeSessionId'

/**
 * 会话存储类
 * 基于 workspaceState 持久化会话列表
 * 提供最小增量写入能力（用户消息、助手增量）
 */
export class SessionStore {
  /**
   * 构造函数
   * @param context VS Code 扩展上下文
   */
  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * 获取所有会话
   * @returns 会话列表
   */
  async getSessions(): Promise<ChatSession[]> {
    return this.context.workspaceState.get<ChatSession[]>(SESSION_LIST_KEY, [])
  }

  /**
   * 根据 ID 获取会话
   * @param sessionId 会话 ID
   * @returns 会话对象或 undefined
   */
  async getSessionById(sessionId: string): Promise<ChatSession | undefined> {
    const sessions = await this.getSessions()
    return sessions.find(item => item.id === sessionId)
  }

  /**
   * 设置活跃会话 ID
   * @param sessionId 会话 ID
   */
  async setActiveSessionId(sessionId: string): Promise<void> {
    await this.context.workspaceState.update(ACTIVE_SESSION_ID_KEY, sessionId)
  }

  /**
   * 获取活跃会话 ID
   * @returns 会话 ID 或 undefined
   */
  async getActiveSessionId(): Promise<string | undefined> {
    return this.context.workspaceState.get<string>(ACTIVE_SESSION_ID_KEY)
  }

  async createSession(sessionId: string, titleSeed = ''): Promise<ChatSession> {
    const now = Date.now()
    const sessions = await this.getSessions()
    const existing = sessions.find(item => item.id === sessionId)
    if (existing) {
      await this.setActiveSessionId(sessionId)
      return existing
    }

    const created = createEmptySession(sessionId, titleSeed, now)
    const nextSessions = [created, ...sessions]
    await this.saveSessions(nextSessions)
    await this.setActiveSessionId(sessionId)
    return created
  }

  async appendUserMessage(sessionId: string, content: string): Promise<ChatSession> {
    const now = Date.now()
    const sessions = await this.getSessions()
    const { session, nextSessions } = getOrCreateSession(sessions, sessionId, content, now)

    session.messages.push({
      role: 'user',
      content,
      timestamp: now,
    })
    session.updatedAt = now

    await this.saveSessions(nextSessions)
    await this.setActiveSessionId(sessionId)
    return session
  }

  async appendAssistantDelta(sessionId: string, delta: string): Promise<ChatSession> {
    const now = Date.now()
    const sessions = await this.getSessions()
    const { session, nextSessions } = getOrCreateSession(sessions, sessionId, '', now)

    if (!delta) {
      await this.saveSessions(nextSessions)
      return session
    }

    const lastMessage = session.messages[session.messages.length - 1]
    // 仅拼接“未结束”的助手消息；已结束消息需要开启新消息，避免串轮次。
    if (lastMessage?.role === 'assistant' && lastMessage.finishReason === undefined) {
      lastMessage.content += delta
      lastMessage.timestamp = now
    } else {
      session.messages.push({
        role: 'assistant',
        content: delta,
        timestamp: now,
      })
    }

    session.updatedAt = now
    await this.saveSessions(nextSessions)
    return session
  }

  async appendAssistantError(sessionId: string, message: string): Promise<ChatSession> {
    const now = Date.now()
    const sessions = await this.getSessions()
    const { session, nextSessions } = getOrCreateSession(sessions, sessionId, '', now)

    session.messages.push({
      role: 'assistant',
      content: `[error] ${message}`,
      timestamp: now,
      finishReason: 'error',
    })
    session.updatedAt = now

    await this.saveSessions(nextSessions)
    return session
  }

  async setLastAssistantFinishReason(
    sessionId: string,
    finishReason: NonNullable<ChatMessage['finishReason']>
  ): Promise<ChatSession | undefined> {
    const now = Date.now()
    const sessions = await this.getSessions()
    const session = sessions.find(item => item.id === sessionId)
    if (!session) {
      return undefined
    }

    const lastAssistant = findLastPendingAssistantMessage(session.messages)
    if (!lastAssistant) {
      return session
    }

    lastAssistant.finishReason = finishReason
    lastAssistant.timestamp = now
    session.updatedAt = now
    await this.saveSessions(sessions)
    return session
  }

  async deleteSession(sessionId: string): Promise<void> {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId) {
      return
    }

    const sessions = await this.getSessions()
    const nextSessions = sessions.filter(session => session.id !== normalizedSessionId)
    await this.saveSessions(nextSessions)

    const activeSessionId = await this.getActiveSessionId()
    if (activeSessionId === normalizedSessionId) {
      await this.context.workspaceState.update(ACTIVE_SESSION_ID_KEY, undefined)
    }
  }

  private async saveSessions(sessions: ChatSession[]): Promise<void> {
    const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
    await this.context.workspaceState.update(SESSION_LIST_KEY, sortedSessions)
  }
}

function getOrCreateSession(
  sessions: ChatSession[],
  sessionId: string,
  titleSeed: string,
  now: number
): { session: ChatSession; nextSessions: ChatSession[] } {
  const existing = sessions.find(item => item.id === sessionId)
  if (existing) {
    return { session: existing, nextSessions: sessions }
  }

  const created = createEmptySession(sessionId, titleSeed, now)
  const nextSessions = [created, ...sessions]
  return { session: created, nextSessions }
}

function createEmptySession(sessionId: string, titleSeed: string, now: number): ChatSession {
  const title = toSessionTitle(titleSeed)
  const messages: ChatMessage[] = []
  return {
    id: sessionId,
    title,
    createdAt: now,
    updatedAt: now,
    messages,
  }
}

function toSessionTitle(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (!normalized) {
    return 'New Chat'
  }
  const maxLen = 40
  if (normalized.length <= maxLen) {
    return normalized
  }
  return `${normalized.slice(0, maxLen)}...`
}

function findLastPendingAssistantMessage(messages: ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) {
      continue
    }
    if (message.role === 'assistant' && message.finishReason === undefined) {
      return message
    }
  }
  return undefined
}
