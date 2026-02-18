import { SessionStore } from '../storage/sessionStore'

export class SessionService {
  constructor(private readonly sessionStore: SessionStore) {}

  async createSession(): Promise<{ sessionId: string }> {
    const sessionId = createSessionId()
    await this.sessionStore.createSession(sessionId)
    return { sessionId }
  }

  async getSessions() {
    return this.sessionStore.getSessions()
  }
}

function createSessionId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `session-${ts}-${rand}`
}
