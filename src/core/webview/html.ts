import * as vscode from 'vscode'

/**
 * 读取并加工 Webview HTML：
 * 1. 读 media/index.html
 * 2. 重写静态资源 URL 为 webview 可访问 URI
 * 3. 注入 CSP
 * 4. 失败时回退到纯文本提示页
 */
export async function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): Promise<string> {
  const mediaUri = vscode.Uri.joinPath(extensionUri, 'media')
  const indexUri = vscode.Uri.joinPath(mediaUri, 'index.html')

  try {
    // 使用 VS Code 的虚拟文件系统 API，避免直接依赖 Node fs 类型。
    const indexBuffer = await vscode.workspace.fs.readFile(indexUri)
    const rawHtml = decodeUtf8(indexBuffer)
    const rewrittenHtml = rewriteAssetUrls(rawHtml, webview, mediaUri)
    return injectCsp(rewrittenHtml, webview.cspSource)
  } catch {
    // 前端资源未构建或拷贝失败时给出明确提示，避免空白页。
    return getFallbackHtml(webview.cspSource)
  }
}

/**
 * 将 Uint8Array 解码为 UTF-8 字符串。
 * 当前仓库 tsconfig 未引入 DOM/TextDecoder 类型，这里用兼容实现避免类型依赖。
 */
function decodeUtf8(buffer: Uint8Array): string {
  let result = ''
  for (const value of buffer) {
    result += String.fromCharCode(value)
  }
  return decodeURIComponent(escape(result))
}

/**
 * 把 index.html 中的静态资源路径改写为 webview 安全 URI。
 * 例：`/assets/index-xxx.js` -> `vscode-webview-resource://...`
 */
function rewriteAssetUrls(html: string, webview: vscode.Webview, mediaUri: vscode.Uri): string {
  const resolveAsset = (assetPath: string): string => {
    const normalizedPath = assetPath.replace(/^\//, '')
    const segments = normalizedPath.split('/').filter(Boolean)
    const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, ...segments))
    return assetUri.toString()
  }

  return html.replace(/(src|href)=["'](\/?(?:assets\/[^"']+|vite\.svg))["']/g, (_match, attr, url) => {
    return `${attr}="${resolveAsset(url)}"`
  })
}

/**
 * 注入或替换 CSP，限制 Webview 可加载资源来源。
 * 注意：脚本来源限定为 `cspSource`，阻止任意远程脚本执行。
 */
function injectCsp(html: string, cspSource: string): string {
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource}; font-src ${cspSource};">`

  if (/<meta http-equiv=["']Content-Security-Policy["']/.test(html)) {
    return html.replace(/<meta http-equiv=["']Content-Security-Policy["'][^>]*>/, cspMeta)
  }

  return html.replace('<head>', `<head>\n  ${cspMeta}`)
}

/**
 * 构建失败时的回退页面，避免用户看到空白区域。
 * 这里也保留最小 CSP，避免放松默认安全策略。
 */
function getFallbackHtml(cspSource: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource};" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Chat</title>
  </head>
  <body>
    <p>Webview assets are not ready. Run "pnpm build:web" and "pnpm copy:web".</p>
  </body>
</html>`
}
