import type { ContextEditorStateMessage } from '@agent/types'
import * as vscode from 'vscode'

export type EditorContextStatePayload = ContextEditorStateMessage['payload']

let lastActiveEditorPath: string | undefined

export function getEditorContextState(): EditorContextStatePayload {
  const editor = resolveEditorForContext()
  if (!editor) {
    return {
      hasActiveEditor: false,
      fileName: null,
      selectedLineCount: 0,
      timestamp: Date.now(),
    }
  }

  const selectedLineRange = getSelectionLineRange(editor.selection)
  const selectedLineCount = selectedLineRange?.lineCount ?? 0
  return {
    hasActiveEditor: true,
    fileName: getFileName(editor.document.uri.fsPath),
    selectedLineCount,
    timestamp: Date.now(),
  }
}

export function resolveEditorForContext(): vscode.TextEditor | undefined {
  const activeEditor = vscode.window.activeTextEditor
  if (activeEditor) {
    lastActiveEditorPath = activeEditor.document.uri.fsPath
    return activeEditor
  }

  const visibleEditors = vscode.window.visibleTextEditors
  if (!Array.isArray(visibleEditors) || visibleEditors.length === 0) {
    return undefined
  }

  if (lastActiveEditorPath) {
    const matched = visibleEditors.find(editor => editor.document.uri.fsPath === lastActiveEditorPath)
    if (matched) {
      return matched
    }
  }

  return visibleEditors[0]
}

export interface SelectionLineRange {
  startLine: number
  endLine: number
  lineCount: number
}

export function getSelectionLineRange(selection: vscode.Selection): SelectionLineRange | undefined {
  if (selection.isEmpty) {
    return undefined
  }

  const startLineZeroBased = selection.start.line
  let endLineZeroBased = selection.end.line
  // 选区结束点位于“下一行行首”时，VS Code 的 end.line 为尾后边界，不应计入该行。
  if (selection.end.character === 0 && endLineZeroBased > startLineZeroBased) {
    endLineZeroBased -= 1
  }

  const startLine = startLineZeroBased + 1
  const endLine = endLineZeroBased + 1
  return {
    startLine,
    endLine,
    lineCount: endLine - startLine + 1,
  }
}

function getFileName(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/').trim()
  if (!normalized) {
    return null
  }
  const segments = normalized.split('/')
  const fileName = segments[segments.length - 1]
  return fileName || null
}
