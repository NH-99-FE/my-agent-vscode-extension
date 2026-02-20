import * as vscode from 'vscode'
import type { ToolDefinition, ToolExecutionFailure, ToolExecutionResult } from './toolTypes'

interface ReadFileByPathArgs extends Record<string, unknown> {
  path: string
}

interface NormalizedPath {
  value: string
  isAbsolute: boolean
}

interface FsStatLike {
  type: number
}

interface WorkspaceFsWithStat {
  stat?: (uri: vscode.Uri) => Promise<FsStatLike>
}

const FILE_TYPE_SYMBOLIC_LINK = 64

export const readFileByPathTool: ToolDefinition<ReadFileByPathArgs> = {
  name: 'read_file_by_path',
  description: 'Read text content from a file path inside the current workspace.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      path: {
        type: 'string',
        description: 'File path. Supports workspace-relative or absolute path inside current workspace.',
      },
    },
    required: ['path'],
  },
  async execute(args, context) {
    const rawPath = typeof args.path === 'string' ? args.path.trim() : ''
    if (!rawPath) {
      return toFailure('invalid_path', 'Path is required.')
    }

    if (context.workspaceRoots.length === 0) {
      return toFailure('out_of_workspace', 'No workspace folder is open.')
    }

    const normalizedRoots = context.workspaceRoots
      .map(root => normalizePathForBoundary(root))
      .filter(normalized => normalized.isAbsolute)
      .map(normalized => normalized.value)
    const candidates = buildCandidatePaths(rawPath, normalizedRoots)
    let sawOutOfWorkspace = false
    let sawNotFound = false

    for (const candidate of candidates) {
      const normalizedCandidate = normalizePathForBoundary(candidate)
      if (!normalizedCandidate.isAbsolute) {
        sawOutOfWorkspace = true
        continue
      }

      const containingRoot = findContainingRoot(normalizedCandidate.value, normalizedRoots)
      if (!containingRoot) {
        sawOutOfWorkspace = true
        continue
      }

      const includesSymbolicLink = await hasSymbolicLinkInPath(normalizedCandidate.value, containingRoot)
      if (includesSymbolicLink) {
        return toFailure('out_of_workspace', 'Paths traversing symbolic links are not allowed.')
      }

      try {
        const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(normalizedCandidate.value))
        const bytesTruncated = raw.length > context.limits.maxReadBytes
        const sampled = bytesTruncated ? raw.subarray(0, context.limits.maxReadBytes) : raw
        if (isLikelyBinary(sampled, context.limits.maxControlCharRatio)) {
          return toFailure('binary', 'Binary file is not supported.')
        }

        const decoded = decodeUtf8(sampled)
        const normalized = normalizeTextContent(decoded, {
          maxReadChars: context.limits.maxReadChars,
          bytesTruncated,
        })
        if (!normalized.content) {
          return toFailure('empty', 'File has no readable text content.')
        }

        return {
          ok: true,
          data: {
            path: normalizedCandidate.value,
            content: normalized.content,
            truncatedByBytes: normalized.truncatedByBytes,
            truncatedByChars: normalized.truncatedByChars,
          },
        }
      } catch (error) {
        if (isFileNotFoundError(error)) {
          sawNotFound = true
          continue
        }
        const message = error instanceof Error ? error.message : 'Unknown file read error.'
        return toFailure('unreadable', message)
      }
    }

    if (sawNotFound) {
      return toFailure('not_found', 'File not found in workspace.')
    }
    if (sawOutOfWorkspace) {
      return toFailure('out_of_workspace', 'Path is outside workspace roots.')
    }
    return toFailure('not_found', 'File not found in workspace.')
  },
}

function buildCandidatePaths(rawPath: string, normalizedRoots: string[]): string[] {
  if (isAbsolutePath(rawPath)) {
    const normalizedAbsolute = normalizePathForBoundary(rawPath)
    return normalizedAbsolute.isAbsolute ? [normalizedAbsolute.value] : []
  }
  const relative = normalizePathForBoundary(rawPath)
  if (relative.isAbsolute) {
    return [relative.value]
  }
  return normalizedRoots.map(root => joinNormalizedPath(root, relative.value))
}

function findContainingRoot(candidate: string, normalizedRoots: string[]): string | undefined {
  for (const root of normalizedRoots) {
    if (isPathInsideRoot(candidate, root)) {
      return root
    }
  }
  return undefined
}

function joinNormalizedPath(base: string, relative: string): string {
  const normalizedBase = normalizePathForBoundary(base)
  const normalizedRelative = normalizePathForBoundary(relative)
  if (normalizedRelative.isAbsolute) {
    return normalizedRelative.value
  }

  const baseValue = trimTrailingSlashPreservingRoot(normalizedBase.value)
  if (baseValue === '/' || isWindowsDriveRoot(baseValue)) {
    return normalizePathForBoundary(`${baseValue}${normalizedRelative.value}`).value
  }
  return normalizePathForBoundary(`${baseValue}/${normalizedRelative.value}`).value
}

function trimTrailingSlashPreservingRoot(value: string): string {
  if (value === '/' || isWindowsDriveRoot(value)) {
    return value
  }
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function isWindowsDriveRoot(value: string): boolean {
  return /^[a-z]:\/$/i.test(value)
}

function isAbsolutePath(value: string): boolean {
  if (!value) {
    return false
  }
  if (value.startsWith('/') || value.startsWith('\\')) {
    return true
  }
  return /^[A-Za-z]:[\\/]/.test(value)
}

function normalizePathForBoundary(value: string): NormalizedPath {
  const unified = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/')
  if (!unified) {
    return { value: '.', isAbsolute: false }
  }

  let prefix = ''
  let isAbsolute = false
  let remainder = unified

  const driveMatch = /^([A-Za-z]):(.*)$/.exec(unified)
  if (driveMatch) {
    const driveLetter = driveMatch[1]
    if (!driveLetter) {
      return { value: '.', isAbsolute: false }
    }
    prefix = `${driveLetter.toLowerCase()}:`
    remainder = driveMatch[2] ?? ''
    if (remainder.startsWith('/')) {
      isAbsolute = true
      remainder = remainder.slice(1)
    }
  } else if (unified.startsWith('/')) {
    isAbsolute = true
    remainder = unified.slice(1)
  }

  const normalizedSegments = normalizePathSegments(remainder.split('/'), !isAbsolute)

  if (prefix) {
    if (isAbsolute) {
      return {
        value: normalizedSegments.length > 0 ? `${prefix}/${normalizedSegments.join('/')}` : `${prefix}/`,
        isAbsolute: true,
      }
    }
    return {
      value: normalizedSegments.length > 0 ? `${prefix}${normalizedSegments.join('/')}` : prefix,
      isAbsolute: false,
    }
  }

  if (isAbsolute) {
    return {
      value: normalizedSegments.length > 0 ? `/${normalizedSegments.join('/')}` : '/',
      isAbsolute: true,
    }
  }

  return {
    value: normalizedSegments.length > 0 ? normalizedSegments.join('/') : '.',
    isAbsolute: false,
  }
}

function normalizePathSegments(segments: string[], allowParentTraversal: boolean): string[] {
  const normalized: string[] = []

  for (const segment of segments) {
    const trimmed = segment.trim()
    if (!trimmed || trimmed === '.') {
      continue
    }
    if (trimmed === '..') {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== '..') {
        normalized.pop()
      } else if (allowParentTraversal) {
        normalized.push('..')
      }
      continue
    }
    normalized.push(trimmed)
  }

  return normalized
}

function isPathInsideRoot(candidate: string, root: string): boolean {
  if (candidate === root) {
    return true
  }
  const normalizedRoot = root.endsWith('/') ? root : `${root}/`
  return candidate.startsWith(normalizedRoot)
}

async function hasSymbolicLinkInPath(candidate: string, root: string): Promise<boolean> {
  const fsWithStat = vscode.workspace.fs as unknown as WorkspaceFsWithStat
  if (typeof fsWithStat.stat !== 'function') {
    return false
  }

  const relative = getRelativePathWithinRoot(candidate, root)
  if (relative === undefined || relative === '') {
    return false
  }

  const relativeSegments = relative.split('/').filter(segment => segment.length > 0)
  let current = root
  for (const segment of relativeSegments) {
    current = joinNormalizedPath(current, segment)
    try {
      const stat = await fsWithStat.stat(vscode.Uri.file(current))
      if ((stat.type & FILE_TYPE_SYMBOLIC_LINK) === FILE_TYPE_SYMBOLIC_LINK) {
        return true
      }
    } catch {
      return false
    }
  }
  return false
}

function getRelativePathWithinRoot(candidate: string, root: string): string | undefined {
  if (candidate === root) {
    return ''
  }
  const normalizedRoot = root.endsWith('/') ? root : `${root}/`
  if (!candidate.startsWith(normalizedRoot)) {
    return undefined
  }
  return candidate.slice(normalizedRoot.length)
}

function isFileNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  const normalized = error.message.toLowerCase()
  return (
    normalized.includes('file not found') ||
    normalized.includes('no such file') ||
    normalized.includes('cannot find the path') ||
    normalized.includes('enoent')
  )
}

function isLikelyBinary(buffer: Uint8Array, maxControlCharRatio: number): boolean {
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
  return controlCharCount / buffer.length > maxControlCharRatio
}

function decodeUtf8(buffer: Uint8Array): string {
  let result = ''
  for (const value of buffer) {
    result += String.fromCharCode(value)
  }
  return decodeURIComponent(escape(result))
}

function normalizeTextContent(
  text: string,
  options: {
    maxReadChars: number
    bytesTruncated: boolean
  }
): {
  content: string
  truncatedByBytes: boolean
  truncatedByChars: boolean
} {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      content: '',
      truncatedByBytes: options.bytesTruncated,
      truncatedByChars: false,
    }
  }

  const truncatedByChars = trimmed.length > options.maxReadChars
  const limited = truncatedByChars ? trimmed.slice(0, options.maxReadChars) : trimmed
  if (!truncatedByChars && !options.bytesTruncated) {
    return {
      content: limited,
      truncatedByBytes: false,
      truncatedByChars: false,
    }
  }

  const reasons: string[] = []
  if (truncatedByChars) {
    reasons.push('truncated by characters')
  }
  if (options.bytesTruncated) {
    reasons.push('truncated by bytes')
  }

  return {
    content: `${limited}\n...[${reasons.join(', ')}]`,
    truncatedByBytes: options.bytesTruncated,
    truncatedByChars,
  }
}

function toFailure(code: ToolExecutionFailure['code'], message: string): ToolExecutionResult {
  return {
    ok: false,
    code,
    message,
  }
}
