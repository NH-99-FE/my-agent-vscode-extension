import type { BuiltContext, ContextSnippet } from '@agent/types'
import { getSelectionLineRange, resolveEditorForContext } from './editorState'

let snippetCounter = 0

/**
 * 基于当前活动编辑器构建最小上下文。
 * 当前实现只采集两类片段：
 * 1. activeEditor：当前文件全文（截断到安全长度）
 * 2. selection：当前选区文本（若存在）
 */
export function buildContextFromActiveEditor(): BuiltContext {
  const snippets: ContextSnippet[] = []
  const editor = resolveEditorForContext()
  if (!editor) {
    return { snippets }
  }

  const fullText = editor.document.getText()
  const normalizedFullText = normalizeSnippetContent(fullText)

  if (normalizedFullText) {
    snippets.push({
      id: createSnippetId('active'),
      source: 'activeEditor',
      filePath: editor.document.uri.fsPath,
      languageId: editor.document.languageId,
      content: normalizedFullText,
      startLine: 1,
      endLine: Math.max(1, editor.document.lineCount),
    })
  }

  if (!editor.selection.isEmpty) {
    const selectionText = editor.document.getText(editor.selection)
    const normalizedSelectionText = normalizeSnippetContent(selectionText)
    const selectionLineRange = getSelectionLineRange(editor.selection)

    if (normalizedSelectionText && selectionLineRange) {
      snippets.push({
        id: createSnippetId('selection'),
        source: 'selection',
        filePath: editor.document.uri.fsPath,
        languageId: editor.document.languageId,
        content: normalizedSelectionText,
        startLine: selectionLineRange.startLine,
        endLine: selectionLineRange.endLine,
      })
    }
  }

  return { snippets }
}

/**
 * 对片段内容做标准化，避免把超大文本直接塞进提示词。
 */
function normalizeSnippetContent(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }

  const maxChars = 4000
  if (trimmed.length <= maxChars) {
    return trimmed
  }
  return `${trimmed.slice(0, maxChars)}\n...[truncated]`
}

function createSnippetId(prefix: string): string {
  snippetCounter += 1
  return `${prefix}-${Date.now()}-${snippetCounter}`
}
