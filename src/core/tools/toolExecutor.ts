import { assertNotCancelled } from '../llm/cancellation'
import { LlmAbortError, LlmTimeoutError } from '../llm/errors'
import { ToolRegistry } from './toolRegistry'
import type { ToolCallRequest, ToolExecutionContext, ToolExecutionEnvelope, ToolExecutionFailure, ToolExecutionResult } from './toolTypes'

export class ToolExecutor {
  constructor(private readonly registry: ToolRegistry) {}

  async execute(call: ToolCallRequest, context: ToolExecutionContext): Promise<ToolExecutionEnvelope> {
    assertNotCancelled(context.signal)

    const definition = this.registry.get(call.name)
    if (!definition) {
      return {
        name: call.name,
        callId: call.callId,
        result: toFailure('unknown_tool', `Tool "${call.name}" is not registered.`),
      }
    }

    const parsedArguments = parseArguments(call.argumentsJson)
    if (!parsedArguments) {
      return {
        name: call.name,
        callId: call.callId,
        result: toFailure('invalid_arguments', `Tool "${call.name}" received invalid JSON arguments.`),
      }
    }

    try {
      const result = await definition.execute(parsedArguments, context)
      assertNotCancelled(context.signal)
      return {
        name: call.name,
        callId: call.callId,
        result,
      }
    } catch (error) {
      if (error instanceof LlmAbortError || error instanceof LlmTimeoutError) {
        throw error
      }
      const message = error instanceof Error ? error.message : `Tool "${call.name}" failed unexpectedly.`
      return {
        name: call.name,
        callId: call.callId,
        result: toFailure('execution_failed', message),
      }
    }
  }
}

function parseArguments(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return undefined
    }
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

function toFailure(code: ToolExecutionFailure['code'], message: string): ToolExecutionResult {
  return {
    ok: false,
    code,
    message,
  }
}
