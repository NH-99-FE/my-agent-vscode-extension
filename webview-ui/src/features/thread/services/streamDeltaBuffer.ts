type StreamDeltaBufferActions = {
  appendAssistantDeltaBatch: (sessionId: string, textDeltaBatch: string) => void
}

export type StreamDeltaBuffer = {
  enqueue: (sessionId: string, delta: string) => void
  flushSession: (sessionId: string) => void
  flushAll: () => void
  dispose: () => void
}

function isValidSessionId(sessionId: string): boolean {
  return sessionId.trim().length > 0
}

/**
 * 为 chat.delta 提供 session 级 rAF 合帧，减少 token 级频繁写入造成的重渲染。
 */
export function createStreamDeltaBuffer(actions: StreamDeltaBufferActions): StreamDeltaBuffer {
  const pendingBySession = new Map<string, string>()
  let frameId: number | null = null
  let disposed = false

  const flushSession = (sessionId: string): void => {
    if (disposed || !isValidSessionId(sessionId)) {
      return
    }
    const textDeltaBatch = pendingBySession.get(sessionId)
    if (textDeltaBatch === undefined) {
      return
    }

    pendingBySession.delete(sessionId)
    if (textDeltaBatch.length > 0) {
      actions.appendAssistantDeltaBatch(sessionId, textDeltaBatch)
    }

    if (pendingBySession.size === 0 && frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
  }

  const flushAll = (): void => {
    if (disposed) {
      return
    }
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
    if (pendingBySession.size === 0) {
      return
    }

    const entries = Array.from(pendingBySession.entries())
    pendingBySession.clear()
    for (const [sessionId, textDeltaBatch] of entries) {
      if (textDeltaBatch.length === 0) {
        continue
      }
      actions.appendAssistantDeltaBatch(sessionId, textDeltaBatch)
    }
  }

  const scheduleFlush = (): void => {
    if (disposed || frameId !== null) {
      return
    }
    frameId = requestAnimationFrame(() => {
      frameId = null
      flushAll()
    })
  }

  return {
    enqueue: (sessionId, delta) => {
      if (disposed || !isValidSessionId(sessionId) || delta.length === 0) {
        return
      }
      const pending = pendingBySession.get(sessionId) ?? ''
      pendingBySession.set(sessionId, `${pending}${delta}`)
      scheduleFlush()
    },
    flushSession,
    flushAll,
    dispose: () => {
      if (disposed) {
        return
      }
      flushAll()
      disposed = true
      pendingBySession.clear()
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
        frameId = null
      }
    },
  }
}
