/**
 * @gdd-node WebviewManager
 * @gdd-graph viewer/L1-viewer.mermaid
 *
 * VSCode WebviewPanel을 생성하고 관리한다.
 * 그래프 데이터를 받아 Webview HTML을 갱신한다.
 *
 * L2 파이프라인: PanelCreate → OptionConfig → HtmlGenerator → CspBuilder → ContentSetter
 *               PanelCreate → MessageHandler → EventRouter
 *               PanelCreate → DisposeHandler
 */

import * as vscode from 'vscode';
import { GddGraph, NodeMeta } from '../graphEngine/types';
import { getMermaidRendererScript } from './mermaidRenderer';

const VIEW_TYPE = 'gddViewer';

/** Webview → Extension 메시지 타입 */
export interface ViewerMessage {
  type: 'nodeClick' | 'nodeDblClick' | 'back';
  nodeId?: string;
}

/** 노드 클릭 콜백 */
export type NodeClickHandler = (nodeId: string, graph: GddGraph) => void;
/** 노드 더블클릭 콜백 */
export type NodeDblClickHandler = (nodeId: string, graph: GddGraph) => void;
/** 뒤로가기 콜백 */
export type BackHandler = (graph: GddGraph) => void;

export class WebviewManager implements vscode.Disposable {
  private _panel: vscode.WebviewPanel | undefined;
  private _currentGraph: GddGraph | undefined;
  private readonly _disposables: vscode.Disposable[] = [];

  private _onNodeClick: NodeClickHandler | undefined;
  private _onNodeDblClick: NodeDblClickHandler | undefined;
  private _onBack: BackHandler | undefined;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  /** 이벤트 핸들러 등록 */
  set onNodeClick(handler: NodeClickHandler) { this._onNodeClick = handler; }
  set onNodeDblClick(handler: NodeDblClickHandler) { this._onNodeDblClick = handler; }
  set onBack(handler: BackHandler) { this._onBack = handler; }

  /**
   * PanelCreate: WebviewPanel을 생성하거나 기존 패널을 reveal한다.
   * OptionConfig: enableScripts, retainContextWhenHidden 설정.
   */
  show(graph: GddGraph): void {
    this._currentGraph = graph;

    if (this._panel) {
      this._panel.reveal();
      this.updateContent(graph);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      `GDD Viewer: ${graph.filePath}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.updateContent(graph);

    // MessageHandler: Webview→Extension 메시지 수신
    this._disposables.push(
      this._panel.webview.onDidReceiveMessage((msg: ViewerMessage) => {
        this.routeMessage(msg);
      })
    );

    // DisposeHandler: 패널 닫힘 시 리소스 정리
    this._panel.onDidDispose(() => {
      this._panel = undefined;
      this._currentGraph = undefined;
    }, null, this._disposables);
  }

  /** 현재 표시 중인 그래프를 갱신한다. */
  updateContent(graph: GddGraph): void {
    this._currentGraph = graph;
    if (!this._panel) { return; }
    this._panel.title = `GDD Viewer: ${graph.filePath}`;
    this._panel.webview.html = this.buildHtml(graph);
  }

  /** 현재 표시 중인 그래프를 반환한다. */
  get currentGraph(): GddGraph | undefined {
    return this._currentGraph;
  }

  /**
   * EventRouter: 메시지 type에 따라 NodeInteraction(클릭) 또는 Navigation(더블클릭/뒤로가기)으로 분배한다.
   */
  private routeMessage(msg: ViewerMessage): void {
    if (!this._currentGraph) { return; }

    switch (msg.type) {
      case 'nodeClick':
        if (msg.nodeId && this._onNodeClick) {
          this._onNodeClick(msg.nodeId, this._currentGraph);
        }
        break;
      case 'nodeDblClick':
        if (msg.nodeId && this._onNodeDblClick) {
          this._onNodeDblClick(msg.nodeId, this._currentGraph);
        }
        break;
      case 'back':
        if (this._onBack) {
          this._onBack(this._currentGraph);
        }
        break;
    }
  }

  /**
   * HtmlGenerator + CspBuilder + ContentSetter:
   * mermaid 텍스트, 노드 메타, CSP를 포함하는 HTML을 조립한다.
   */
  private buildHtml(graph: GddGraph): string {
    const nonce = getNonce();
    const nodeMetaMap: Record<string, NodeMeta> = {};
    for (const node of graph.nodes) {
      nodeMetaMap[node.id] = node.meta;
    }

    const hasParent = !!graph.parentGraph;
    const rendererScript = getMermaidRendererScript(
      graph.rawMermaid,
      nodeMetaMap,
      hasParent
    );

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;
      style-src 'unsafe-inline';
      img-src data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GDD Viewer</title>
  <style>
    body {
      margin: 0; padding: 0;
      background: var(--vscode-editor-background, #1e1e1e);
      color: var(--vscode-editor-foreground, #d4d4d4);
      font-family: var(--vscode-font-family);
    }
    #toolbar {
      padding: 6px 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #444);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    #toolbar button {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
      border: none;
      padding: 4px 10px;
      cursor: pointer;
      border-radius: 3px;
      font-size: 13px;
    }
    #toolbar button:hover {
      background: var(--vscode-button-hoverBackground, #1177bb);
    }
    #toolbar button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    #breadcrumb {
      font-size: 13px;
      opacity: 0.8;
    }
    #graph-container {
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: calc(100vh - 50px);
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
    .node-selected rect,
    .node-selected polygon,
    .node-selected circle {
      stroke: var(--vscode-focusBorder, #007fd4) !important;
      stroke-width: 3px !important;
    }
    .node-drillable { cursor: pointer; }
    #info-panel {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: var(--vscode-editorWidget-background, #252526);
      border-top: 1px solid var(--vscode-panel-border, #444);
      padding: 10px 16px;
      font-size: 13px;
      display: none;
      max-height: 35vh;
      overflow-y: auto;
    }
    #info-panel .meta-row { margin: 2px 0; }
    #info-panel .meta-label { opacity: 0.7; margin-right: 6px; }
    #info-panel .actions { margin-top: 6px; }
    #info-panel .actions button {
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #fff);
      border: none; padding: 3px 8px; cursor: pointer;
      border-radius: 3px; font-size: 12px; margin-right: 4px;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="btn-back" ${hasParent ? '' : 'disabled'}>← Back</button>
    <span id="breadcrumb">${escapeHtml(graph.filePath)} (L${graph.level})</span>
  </div>
  <div id="graph-container"></div>
  <div id="info-panel"></div>

  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script nonce="${nonce}">
    ${rendererScript}
  </script>
</body>
</html>`;
  }

  /** 현재 패널에 포커스를 요청한다. */
  reveal(): void {
    this._panel?.reveal();
  }

  dispose(): void {
    this._panel?.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
  }
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
