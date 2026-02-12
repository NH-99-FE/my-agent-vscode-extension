import type { ChatMessage, ChatSession } from '@agent/types'
import * as vscode from 'vscode'

const SESSION_LIST_KEY = 'agent.chat.sessions'
const ACTIVE_SESSION_ID_KEY = 'agent.chat.activeSessionId'

/**
 * 会话存储：
 * - 基于 workspaceState 持久化会话列表
 * - 提供最小增量写入能力（用户消息、助手增量）
 */
export class SessionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getSessions(): Promise<ChatSession[]> {
    return this.context.workspaceState.get<ChatSession[]>(SESSION_LIST_KEY, [])
  }

  async setActiveSessionId(sessionId: string): Promise<void> {
    await this.context.workspaceState.update(ACTIVE_SESSION_ID_KEY, sessionId)
  }

  async getActiveSessionId(): Promise<string | undefined> {
    return this.context.workspaceState.get<string>(ACTIVE_SESSION_ID_KEY)
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
    if (lastMessage?.role === 'assistant') {
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
    })
    session.updatedAt = now

    await this.saveSessions(nextSessions)
    return session
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
