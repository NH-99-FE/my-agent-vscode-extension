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
const TIMEOUT_REASON = '__timeout__'

export function createTimeoutController(timeoutMs?: number): LlmCancellationController {
  const controller = new LlmCancellationController()
  if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
    return controller
  }

  const handle = setTimeout(() => {
    controller.cancel(TIMEOUT_REASON)
  }, timeoutMs)

  controller.signal.onCancel(() => {
    clearTimeout(handle)
  })

  return controller
}

export function mergeSignals(primary?: LlmCancellationSignal, secondary?: LlmCancellationSignal): LlmCancellationSignal | undefined {
  if (!primary && !secondary) {
    return undefined
  }

  const merged = new LlmCancellationController()
  const offPrimary = primary?.onCancel(reason => {
    merged.cancel(reason)
  })
  const offSecondary = secondary?.onCancel(reason => {
    merged.cancel(reason)
  })

  if (primary?.aborted) {
    merged.cancel(primary.reason)
  }
  if (secondary?.aborted) {
    merged.cancel(secondary.reason)
  }

  merged.signal.onCancel(() => {
    offPrimary?.()
    offSecondary?.()
  })

  return merged.signal
}

export function assertNotCancelled(signal?: LlmCancellationSignal): void {
  if (!signal?.aborted) {
    return
  }
  if (signal.reason === TIMEOUT_REASON) {
    throw new LlmTimeoutError('LLM request timed out.')
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

    const offCancel = signal?.onCancel(reason => {
      clearTimeout(handle)
      reject(new LlmAbortError(reason ?? 'LLM request cancelled.'))
    })
  })
}
