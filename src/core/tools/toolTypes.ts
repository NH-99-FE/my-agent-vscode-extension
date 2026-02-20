import type { LlmCancellationSignal } from '../llm/cancellation'

export type ToolName = 'read_file_by_path'

export type ToolErrorCode =
  | 'invalid_arguments'
  | 'unknown_tool'
  | 'invalid_path'
  | 'out_of_workspace'
  | 'not_found'
  | 'binary'
  | 'empty'
  | 'unreadable'
  | 'execution_failed'

export interface ToolExecutionSuccess {
  ok: true
  data: Record<string, unknown>
}

export interface ToolExecutionFailure {
  ok: false
  code: ToolErrorCode
  message: string
}

export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure

export interface ToolExecutionContext {
  workspaceRoots: string[]
  signal?: LlmCancellationSignal
  limits: {
    maxReadBytes: number
    maxReadChars: number
    maxControlCharRatio: number
  }
}

export interface ToolDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>> {
  name: ToolName
  description: string
  inputSchema: Record<string, unknown>
  execute(args: TArgs, context: ToolExecutionContext): Promise<ToolExecutionResult>
}

export interface ToolCallRequest {
  name: string
  callId: string
  argumentsJson: string
}

export interface ToolExecutionEnvelope {
  name: string
  callId: string
  result: ToolExecutionResult
}
