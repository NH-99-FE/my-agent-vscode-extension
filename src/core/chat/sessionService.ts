import { SessionStore } from '../storage/sessionStore'

export class SessionService {
  constructor(private readonly sessionStore: SessionStore) {}

  async createSession(): Promise<{ sessionId: string }> {
    const sessionId = createSessionId()
    await this.sessionStore.createSession(sessionId)
    return { sessionId }
  }

  async getSessions() {
    const sessions = await this.sessionStore.getSessions()
    // 新建但未产生消息的空会话不进入历史列表，避免出现批量“新会话”噪声。
    return sessions.filter(session => session.messages.length > 0)
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.sessionStore.deleteSession(sessionId)
  }
}

function createSessionId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `session-${ts}-${rand}`
}
