/**
 * @gdd-node PreviewPanel
 * @gdd-graph preview/L1-preview.mermaid
 *
 * .mermaid 파일의 내용을 WebviewPanel로 렌더링한다.
 * 에디터 변경 시 자동 동기화하며, Mermaid.js CDN으로 렌더링한다.
 *
 * L2 파이프라인: PanelFactory → ContentLoader → HtmlBuilder → WebviewSetter
 *               PanelFactory → ColumnResolver, DisposeHandler
 *               ContentLoader → SyncWatcher → HtmlBuilder
 */

import * as vscode from 'vscode';

const VIEW_TYPE = 'gdd.mermaidPreview';

/** 현재 열려 있는 프리뷰 패널 (재사용을 위해 캐싱) */
let currentPanel: vscode.WebviewPanel | undefined;
let currentUri: vscode.Uri | undefined;
let syncDisposable: vscode.Disposable | undefined;

/**
 * gdd.openPreview 커맨드를 등록한다.
 * CommandDispatch + PreviewTrigger (L2-title-bar-icon)
 */
export function registerPreviewCommand(context: vscode.ExtensionContext): vscode.Disposable {
  return vscode.commands.registerCommand('gdd.openPreview', () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !editor.document.uri.fsPath.endsWith('.mermaid')) {
      return;
    }
    openPreview(editor.document.uri, context.extensionUri);
  });
}

/**
 * PanelFactory: WebviewPanel을 생성하거나 기존 패널을 재사용(reveal)한다.
 */
function openPreview(uri: vscode.Uri, extensionUri: vscode.Uri): void {
  currentUri = uri;

  if (currentPanel) {
    // 기존 패널 재사용
    currentPanel.reveal(resolveColumn());
    updateContent(currentPanel.webview, uri);
    return;
  }

  // ColumnResolver: 활성 에디터 옆 컬럼에 표시
  const column = resolveColumn();

  currentPanel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    `Preview: ${getFileName(uri)}`,
    column,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  updateContent(currentPanel.webview, uri);

  // SyncWatcher: 에디터 변경 시 자동 갱신
  setupSyncWatcher(currentPanel.webview);

  // DisposeHandler: 패널 닫힘 시 리소스 정리
  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
    currentUri = undefined;
    syncDisposable?.dispose();
    syncDisposable = undefined;
  });
}

/**
 * ColumnResolver: 현재 활성 에디터의 ViewColumn을 기준으로
 * 프리뷰 패널을 옆 컬럼(Beside)에 표시할 위치를 결정한다.
 */
function resolveColumn(): vscode.ViewColumn {
  const activeColumn = vscode.window.activeTextEditor?.viewColumn;
  return activeColumn ? activeColumn + 1 : vscode.ViewColumn.Beside;
}

/**
 * ContentLoader: URI로 .mermaid 파일의 텍스트 내용을 읽어온다.
 * HtmlBuilder + WebviewSetter: HTML을 조립하여 webview.html에 할당한다.
 */
async function updateContent(webview: vscode.Webview, uri: vscode.Uri): Promise<void> {
  try {
    const content = await vscode.workspace.fs.readFile(uri);
    const mermaidText = Buffer.from(content).toString('utf-8');
    webview.html = buildHtml(webview, mermaidText);
  } catch (error) {
    webview.html = buildErrorHtml(`Failed to read file: ${uri.fsPath}`);
  }
}

/**
 * SyncWatcher: vscode.workspace.onDidChangeTextDocument를 감시하여,
 * 열린 .mermaid 파일이 수정되면 프리뷰를 자동 갱신한다.
 */
function setupSyncWatcher(webview: vscode.Webview): void {
  syncDisposable?.dispose();
  syncDisposable = vscode.workspace.onDidChangeTextDocument(event => {
    if (currentUri && event.document.uri.fsPath === currentUri.fsPath) {
      const mermaidText = event.document.getText();
      webview.html = buildHtml(webview, mermaidText);
    }
  });
}

/**
 * HtmlBuilder: mermaid 텍스트를 포함하는 Webview용 HTML 문서를 생성한다.
 * MermaidRenderer(L2-mermaid-renderer) 로직을 인라인으로 포함한다:
 *   TextReceiver → SyntaxValidator → ThemeApplier → MermaidInit → SvgRenderer → DomInjector
 *   SyntaxValidator/SvgRenderer → ErrorRenderer (실패 시)
 */
function buildHtml(webview: vscode.Webview, mermaidText: string): string {
  const nonce = getNonce();
  const escapedMermaid = escapeHtml(mermaidText);

  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
      style-src 'unsafe-inline';
      img-src ${webview.cspSource} data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GDD Preview</title>
  <style>
    body {
      margin: 0;
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-family: var(--vscode-font-family);
    }
    #graph-container {
      max-width: 100%;
      overflow: auto;
    }
    #graph-container svg {
      max-width: 100%;
      height: auto;
    }
    .error {
      color: var(--vscode-errorForeground, #f48771);
      padding: 16px;
      border: 1px solid var(--vscode-errorForeground, #f48771);
      border-radius: 4px;
      white-space: pre-wrap;
      font-family: var(--vscode-editor-fontFamily, monospace);
    }
  </style>
</head>
<body>
  <div id="graph-container"></div>

  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script nonce="${nonce}">
    (async function() {
      const container = document.getElementById('graph-container');
      const mermaidText = ${JSON.stringify(mermaidText)};

      // ThemeApplier: VSCode 테마(다크/라이트)를 감지하여 mermaid 테마를 결정한다.
      const isDark = document.body.classList.contains('vscode-dark')
        || document.body.classList.contains('vscode-high-contrast');
      const theme = isDark ? 'dark' : 'default';

      // MermaidInit: mermaid.initialize 호출
      mermaid.initialize({
        startOnLoad: false,
        theme: theme,
        securityLevel: 'strict',
      });

      try {
        // SvgRenderer: mermaid.render 실행
        const { svg } = await mermaid.render('gdd-graph', mermaidText);
        // DomInjector: Webview에 SVG 삽입
        container.innerHTML = svg;
      } catch (err) {
        // ErrorRenderer: 파싱/렌더링 에러를 사용자 친화적으로 표시
        container.innerHTML = '<div class="error">Mermaid rendering error:\\n' +
          (err.message || String(err)).replace(/</g, '&lt;') + '</div>';
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * ErrorRenderer: 파일 읽기 실패 시 에러 HTML을 반환한다.
 */
function buildErrorHtml(message: string): string {
  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      margin: 0; padding: 24px;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-errorForeground, #f48771);
      font-family: var(--vscode-font-family);
    }
  </style>
</head>
<body><p>${escapeHtml(message)}</p></body>
</html>`;
}

function getFileName(uri: vscode.Uri): string {
  return uri.fsPath.split(/[\\/]/).pop() || 'preview';
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
