import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

type AssistantMarkdownProps = {
  text: string
}

const markdownContainerClassName = 'assistant-markdown max-w-full break-words text-sm leading-6 text-foreground'

function buildDisabledLinkA11yLabel(href?: string): string {
  const normalizedHref = href?.trim() ?? ''
  if (normalizedHref.length > 0) {
    return `链接已禁用：${normalizedHref}`
  }
  return '链接已禁用'
}

const markdownComponents: Components = {
  a: ({ children, href, title, className }) => (
    <span
      role="link"
      aria-disabled="true"
      aria-label={buildDisabledLinkA11yLabel(href)}
      title={title ?? href}
      className={`cursor-default text-primary underline decoration-primary/60 underline-offset-2 ${className ?? ''}`}
    >
      {children}
    </span>
  ),
  img: () => null,
  p: ({ children }) => <p className="my-2 break-words whitespace-pre-wrap">{children}</p>,
  h1: ({ children }) => <h1 className="mt-4 mb-2 text-xl font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-4 mb-2 text-lg font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-2 text-base font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-2 text-sm font-semibold">{children}</h4>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="break-words">{children}</li>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-border/80 pl-3 text-muted-foreground">{children}</blockquote>,
  table: ({ children }) => (
    <div className="my-2 max-w-full overflow-x-auto">
      <table className="w-full min-w-[24rem] border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border/80 bg-muted/40 px-2 py-1 font-medium">{children}</th>,
  td: ({ children }) => <td className="border border-border/80 px-2 py-1 align-top">{children}</td>,
  code: ({ children, className }) => (
    <code className={`rounded bg-muted/60 px-1 py-0.5 font-mono text-[0.85em] ${className ?? ''}`}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md border border-border/80 bg-muted/40 p-3 font-mono text-[13px] leading-6 text-foreground [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
      {children}
    </pre>
  ),
}

export function AssistantMarkdown({ text }: AssistantMarkdownProps) {
  return (
    <div className={markdownContainerClassName}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
