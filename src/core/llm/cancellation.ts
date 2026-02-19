import { LlmAbortError, LlmTimeoutError } from './errors'

export interface LlmCancellationSignal {
  readonly aborted: boolean
  readonly reason: string | undefined
  onCancel(listener: (reason?: string) => void): () => void
}

export class LlmCancellationController {
  private cancelled = false
  private cancelReason: string | undefined
  private listeners = new Set<(reason?: string) => void>()

  readonly signal: LlmCancellationSignal

  constructor() {
    const getCancelled = () => this.cancelled
    const getCancelReason = () => this.cancelReason
    const addListener = (listener: (reason?: string) => void) => {
      this.listeners.add(listener)
    }
    const removeListener = (listener: (reason?: string) => void) => {
      this.listeners.delete(listener)
    }

    this.signal = {
      get aborted() {
        return getCancelled()
      },
      get reason() {
        return getCancelReason()
      },
      onCancel(listener: (reason?: string) => void): () => void {
        addListener(listener)
        return () => {
          removeListener(listener)
        }
      },
    }
  }

  cancel(reason?: string): void {
    if (this.cancelled) {
      return
    }
    this.cancelled = true
    this.cancelReason = reason

    for (const listener of this.listeners) {
      listener(reason)
    }
    this.listeners.clear()
  }
}

// 内部超时原因码，仅在扩展内部使用。
export const IDLE_TIMEOUT_REASON = '__idle_timeout__'
export const HARD_TIMEOUT_REASON = '__hard_timeout__'
const LEGACY_TIMEOUT_REASON = '__timeout__'

export function createTimeoutController(timeoutMs?: number, timeoutReason: string = HARD_TIMEOUT_REASON): LlmCancellationController {
  const controller = new LlmCancellationController()
  if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
    return controller
  }

  const handle = setTimeout(() => {
    controller.cancel(timeoutReason)
  }, timeoutMs)

  controller.signal.onCancel(() => {
    clearTimeout(handle)
  })

  return controller
}

export function mergeSignals(...signals: Array<LlmCancellationSignal | undefined>): LlmCancellationSignal | undefined {
  const activeSignals = signals.filter((signal): signal is LlmCancellationSignal => Boolean(signal))
  if (activeSignals.length === 0) {
    return undefined
  }

  const merged = new LlmCancellationController()
  const disposers = activeSignals.map(signal =>
    signal.onCancel(reason => {
      merged.cancel(reason)
    })
  )

  for (const signal of activeSignals) {
    if (!signal.aborted) {
      continue
    }
    merged.cancel(signal.reason)
    break
  }

  merged.signal.onCancel(() => {
    for (const dispose of disposers) {
      dispose()
    }
  })

  return merged.signal
}

function toTimeoutMessage(reason: string | undefined): string | undefined {
  if (reason === IDLE_TIMEOUT_REASON) {
    return 'LLM stream idle timed out.'
  }
  if (reason === HARD_TIMEOUT_REASON || reason === LEGACY_TIMEOUT_REASON) {
    return 'LLM request exceeded max duration.'
  }
  return undefined
}

export function assertNotCancelled(signal?: LlmCancellationSignal): void {
  if (!signal?.aborted) {
    return
  }
  const timeoutMessage = toTimeoutMessage(signal.reason)
  if (timeoutMessage) {
    throw new LlmTimeoutError(timeoutMessage)
  }
  throw new LlmAbortError(signal.reason ?? 'LLM request cancelled.')
}

export async function sleep(ms: number, signal?: LlmCancellationSignal): Promise<void> {
  assertNotCancelled(signal)

  await new Promise<void>((resolve, reject) => {
    const handle = setTimeout(
      () => {
        offCancel?.()
        resolve()
      },
      Math.max(0, ms)
    )

    const offCancel = signal?.onCancel(() => {
      clearTimeout(handle)
      try {
        assertNotCancelled(signal)
      } catch (error) {
        reject(error)
        return
      }
      reject(new LlmAbortError('LLM request cancelled.'))
    })
  })
}
