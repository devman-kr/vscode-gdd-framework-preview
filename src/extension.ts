/**
 * @gdd-node Extension
 * @gdd-graph L0-system.mermaid
 *
 * VSCode 확장 진입점.
 * GraphEngine, Preview, Viewer 3개 도메인을 초기화하고 커맨드를 등록한다.
 */

import * as vscode from 'vscode';
import { FileScanner, GraphStore } from './graphEngine';
import { FileDetector, registerPreviewCommand } from './preview';
import { WebviewManager, NodeInteraction, Navigation } from './viewer';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) { return; }

  // ─── GraphEngine 초기화 ───
  const fileScanner = new FileScanner(workspaceRoot);
  await fileScanner.initialize();

  const graphStore = new GraphStore(fileScanner);
  await graphStore.initialize();

  context.subscriptions.push(fileScanner, graphStore);

  // ─── Preview 초기화 ───
  const fileDetector = new FileDetector();
  context.subscriptions.push(fileDetector);
  context.subscriptions.push(registerPreviewCommand(context));

  // ─── Viewer 초기화 ───
  const webviewManager = new WebviewManager(context.extensionUri);
  const nodeInteraction = new NodeInteraction(graphStore, workspaceRoot);
  const navigation = new Navigation(graphStore, webviewManager);

  webviewManager.onNodeClick = (nodeId, graph) => {
    nodeInteraction.handleNodeClick(nodeId, graph);
  };

  webviewManager.onNodeDblClick = (nodeId, graph) => {
    navigation.drillDown(nodeId, graph);
  };

  webviewManager.onBack = () => {
    navigation.goBack();
  };

  context.subscriptions.push(webviewManager);

  // ─── Viewer 커맨드 등록 ───
  context.subscriptions.push(
    vscode.commands.registerCommand('gdd.openViewer', () => {
      // L0 그래프로 시작
      const l0 = graphStore.getGraph('L0-system');
      if (l0) {
        navigation.navigateTo('L0-system');
      } else {
        // L0이 없으면 첫 번째 그래프로 시작
        const all = graphStore.getAllGraphs();
        if (all.length > 0) {
          navigation.navigateTo(all[0].filePath);
        } else {
          vscode.window.showWarningMessage('No GDD graphs found in this workspace.');
        }
      }
    })
  );
}

export function deactivate(): void {}
