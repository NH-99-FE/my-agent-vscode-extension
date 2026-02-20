import { readFileByPathTool } from './readFileByPathTool'
import { ToolRegistry } from './toolRegistry'

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(readFileByPathTool)
  return registry
}
