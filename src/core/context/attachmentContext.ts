import type { ChatAttachment } from '@agent/types'
import * as vscode from 'vscode'

const MAX_ATTACHMENTS = 20
const MAX_ATTACHMENT_BYTES = 256 * 1024
const MAX_ATTACHMENT_CHARS = 4000
const MAX_CONTROL_CHAR_RATIO = 0.1

export interface AttachmentSnippet {
  path: string
  name: string
  content: string
}

export interface SkippedAttachment {
  path: string
  name: string
  reason: string
}

export interface BuiltAttachmentContext {
  snippets: AttachmentSnippet[]
  skipped: SkippedAttachment[]
}

export async function buildAttachmentContext(attachments: ChatAttachment[]): Promise<BuiltAttachmentContext> {
  const snippets: AttachmentSnippet[] = []
  const skipped: SkippedAttachment[] = []
  const seenPaths = new Set<string>()

  for (const attachment of attachments.slice(0, MAX_ATTACHMENTS)) {
    const path = attachment.path.trim()
    const name = attachment.name.trim()

    if (!path || !name) {
      skipped.push({
        path,
        name,
        reason: 'Invalid attachment metadata.',
      })
      continue
    }

    if (seenPaths.has(path)) {
      skipped.push({
        path,
        name,
        reason: 'Duplicate attachment path.',
      })
      continue
    }
    seenPaths.add(path)

    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(path))
      const bytesTruncated = raw.length > MAX_ATTACHMENT_BYTES
      const sampled = bytesTruncated ? raw.subarray(0, MAX_ATTACHMENT_BYTES) : raw

      if (isLikelyBinary(sampled)) {
        skipped.push({
          path,
          name,
          reason: 'Binary file is not supported.',
        })
        continue
      }

      const normalized = normalizeAttachmentContent(decodeUtf8(sampled), bytesTruncated)
      if (!normalized) {
        skipped.push({
          path,
          name,
          reason: 'Attachment has no readable text content.',
        })
        continue
      }

      snippets.push({
        path,
        name,
        content: normalized,
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown attachment read error.'
      skipped.push({
        path,
        name,
        reason,
      })
    }
  }

  return { snippets, skipped }
}

function isLikelyBinary(buffer: Uint8Array): boolean {
  if (buffer.length === 0) {
    return false
  }

  for (const byte of buffer) {
    if (byte === 0) {
      return true
    }
  }

  let controlCharCount = 0
  for (const byte of buffer) {
    const isAllowedWhitespace = byte === 9 || byte === 10 || byte === 13
    if (byte < 32 && !isAllowedWhitespace) {
      controlCharCount += 1
    }
  }

  return controlCharCount / buffer.length > MAX_CONTROL_CHAR_RATIO
}

function normalizeAttachmentContent(text: string, bytesTruncated: boolean): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }

  const charsTruncated = trimmed.length > MAX_ATTACHMENT_CHARS
  const limited = charsTruncated ? trimmed.slice(0, MAX_ATTACHMENT_CHARS) : trimmed

  if (!charsTruncated && !bytesTruncated) {
    return limited
  }

  const reasons: string[] = []
  if (charsTruncated) {
    reasons.push('truncated by characters')
  }
  if (bytesTruncated) {
    reasons.push('truncated by bytes')
  }

  return `${limited}\n...[${reasons.join(', ')}]`
}

function decodeUtf8(buffer: Uint8Array): string {
  let result = ''
  for (const value of buffer) {
    result += String.fromCharCode(value)
  }
  return decodeURIComponent(escape(result))
}
