type StreamDeltaBufferActions = {
  appendAssistantDeltaByMessageId: (messageId: string, textDeltaBatch: string) => void
}

export type StreamDeltaBuffer = {
  enqueue: (messageId: string, delta: string) => void
  flushMessage: (messageId: string) => void
  flushAll: () => void
  dispose: () => void
}

function isValidMessageId(messageId: string): boolean {
  return messageId.trim().length > 0
}

/**
 * 为 chat.delta 提供 message 级 rAF 合帧，减少 token 级频繁写入造成的重渲染。
 */
export function createStreamDeltaBuffer(actions: StreamDeltaBufferActions): StreamDeltaBuffer {
  const pendingByMessageId = new Map<string, string>()
  let frameId: number | null = null
  let disposed = false

  const flushMessage = (messageId: string): void => {
    if (disposed || !isValidMessageId(messageId)) {
      return
    }
    const textDeltaBatch = pendingByMessageId.get(messageId)
    if (textDeltaBatch === undefined) {
      return
    }

    pendingByMessageId.delete(messageId)
    if (textDeltaBatch.length > 0) {
      actions.appendAssistantDeltaByMessageId(messageId, textDeltaBatch)
    }

    if (pendingByMessageId.size === 0 && frameId !== null) {
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
    if (pendingByMessageId.size === 0) {
      return
    }

    const entries = Array.from(pendingByMessageId.entries())
    pendingByMessageId.clear()
    for (const [messageId, textDeltaBatch] of entries) {
      if (textDeltaBatch.length === 0) {
        continue
      }
      actions.appendAssistantDeltaByMessageId(messageId, textDeltaBatch)
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
    enqueue: (messageId, delta) => {
      if (disposed || !isValidMessageId(messageId) || delta.length === 0) {
        return
      }
      const pending = pendingByMessageId.get(messageId) ?? ''
      pendingByMessageId.set(messageId, `${pending}${delta}`)
      scheduleFlush()
    },
    flushMessage,
    flushAll,
    dispose: () => {
      if (disposed) {
        return
      }
      flushAll()
      disposed = true
      pendingByMessageId.clear()
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
        frameId = null
      }
    },
  }
}
