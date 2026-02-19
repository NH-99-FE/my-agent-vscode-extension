declare module 'vscode' {
  // VS Code API 常见 Promise 兼容类型。
  export type Thenable<T> = Promise<T>

  // VS Code 事件函数签名：注册监听器后返回可释放对象。
  export interface Event<T> {
    (listener: (event: T) => unknown): Disposable
  }

  // 可释放资源接口，通常由命令注册、事件监听返回。
  export interface Disposable {
    dispose(): void
  }

  // 资源定位对象（文件、webview 资源等都通过 Uri 表示）。
  export class Uri {
    readonly fsPath: string
    readonly path: string
    toString(): string
    static file(path: string): Uri
    static joinPath(base: Uri, ...pathSegments: string[]): Uri
  }

  export interface Position {
    line: number
    character: number
  }

  export interface Range {
    start: Position
    end: Position
  }

  export interface Selection extends Range {
    isEmpty: boolean
  }

  export interface TextDocument {
    uri: Uri
    languageId: string
    lineCount: number
    getText(range?: Range): string
  }

  export interface TextEditor {
    document: TextDocument
    selection: Selection
  }

  export interface TextEditorSelectionChangeEvent {
    textEditor: TextEditor
    selections: readonly Selection[]
  }

  // 编辑器列位枚举，当前仅用到第一列。
  export enum ViewColumn {
    One = 1,
  }

  // 创建 Webview 时的配置项（这里保留当前步骤所需最小集合）。
  export interface WebviewOptions {
    readonly enableScripts?: boolean
    readonly retainContextWhenHidden?: boolean
    readonly localResourceRoots?: readonly Uri[]
  }

  export interface OpenDialogOptions {
    canSelectFiles?: boolean
    canSelectFolders?: boolean
    canSelectMany?: boolean
    openLabel?: string
  }

  // Webview 运行时对象：设置 HTML、收发消息、转换资源路径。
  export interface Webview {
    readonly cspSource: string
    options?: WebviewOptions
    html: string
    postMessage(message: unknown): Thenable<boolean>
    onDidReceiveMessage: Event<unknown>
    asWebviewUri(localResource: Uri): Uri
  }

  // WebviewPanel 外壳对象：承载 Webview 并控制显示/销毁事件。
  export interface WebviewPanel {
    readonly webview: Webview
    reveal(viewColumn?: ViewColumn): void
    onDidDispose: Event<void>
  }

  export interface WebviewView {
    readonly webview: Webview
    onDidDispose: Event<void>
  }

  export interface WebviewViewProvider {
    resolveWebviewView(webviewView: WebviewView): void | Thenable<void>
  }

  export interface WebviewViewProviderRegistrationOptions {
    webviewOptions?: {
      retainContextWhenHidden?: boolean
    }
  }

  // 扩展生命周期上下文：包含扩展 Uri 和统一资源回收容器。
  export interface SecretStorage {
    get(key: string): Thenable<string | undefined>
    store(key: string, value: string): Thenable<void>
    delete(key: string): Thenable<void>
  }

  export interface Memento {
    get<T>(key: string): T | undefined
    get<T>(key: string, defaultValue: T): T
    update(key: string, value: unknown): Thenable<void>
  }

  export interface ExtensionContext {
    extensionUri: Uri
    secrets: SecretStorage
    workspaceState: Memento
    globalState: Memento
    subscriptions: {
      push(...items: Disposable[]): number
    }
  }

  export interface WorkspaceConfiguration {
    get<T>(section: string): T | undefined
    get<T>(section: string, defaultValue: T): T
    update(section: string, value: unknown, global?: boolean): Thenable<void>
  }

  export namespace commands {
    // 注册命令并返回可释放句柄。
    function registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable
    function executeCommand<T = unknown>(command: string, ...rest: unknown[]): Thenable<T>
  }

  export namespace window {
    function showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>
    function showOpenDialog(options?: OpenDialogOptions): Thenable<readonly Uri[] | undefined>
    const activeTextEditor: TextEditor | undefined
    const visibleTextEditors: readonly TextEditor[]
    const onDidChangeActiveTextEditor: Event<TextEditor | undefined>
    const onDidChangeTextEditorSelection: Event<TextEditorSelectionChangeEvent>
    // 创建 WebviewPanel。
    function createWebviewPanel(viewType: string, title: string, showOptions: ViewColumn, options?: WebviewOptions): WebviewPanel
    function registerWebviewViewProvider(
      viewId: string,
      provider: WebviewViewProvider,
      options?: WebviewViewProviderRegistrationOptions
    ): Disposable
  }

  export namespace workspace {
    function getConfiguration(section?: string): WorkspaceConfiguration
    namespace fs {
      // 从 VS Code 虚拟文件系统读取文件字节流。
      function readFile(uri: Uri): Thenable<Uint8Array>
    }
  }
}
