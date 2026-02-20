import type { LlmToolDefinition } from '../llm/client'
import type { ToolDefinition, ToolName } from './toolTypes'

export class ToolRegistry {
  private readonly definitions = new Map<ToolName, ToolDefinition<Record<string, unknown>>>()

  register(definition: ToolDefinition<Record<string, unknown>>): void {
    if (this.definitions.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered.`)
    }
    this.definitions.set(definition.name, definition)
  }

  get(name: string): ToolDefinition<Record<string, unknown>> | undefined {
    return this.definitions.get(name as ToolName)
  }

  toLlmToolDefinitions(): LlmToolDefinition[] {
    const tools: LlmToolDefinition[] = []
    for (const definition of this.definitions.values()) {
      tools.push({
        type: 'function',
        function: {
          name: definition.name,
          description: definition.description,
          parameters: definition.inputSchema,
        },
      })
    }
    return tools
  }
}
