import { FileText, X } from 'lucide-react'

export type ContextFileItem = {
  /** 稳定标识，当前使用文件路径。 */
  id: string
  /** 文件绝对路径。 */
  path: string
  /** 展示用文件名。 */
  name: string
}

type AddContextFilesProps = {
  /** 已添加的上下文文件列表。 */
  files: ContextFileItem[]
  /** 删除某个文件时触发。 */
  onRemove: (id: string) => void
}

export const AddContextFiles = ({ files, onRemove }: AddContextFilesProps) => {
  if (files.length === 0) {
    return null
  }

  return (
    <div className="mb-2 flex flex-wrap gap-1">
      {files.map(file => (
        <div
          key={file.id}
          className="group flex h-8 items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 text-xs text-muted-foreground"
          title={file.path}
        >
          <FileText className="h-3.5 w-3.5" />
          <span className="max-w-44 truncate">{file.name}</span>
          <button
            type="button"
            className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => onRemove(file.id)}
            aria-label={`移除 ${file.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
