/**
 * @gdd-node NodeInteraction
 * @gdd-graph viewer/L1-viewer.mermaid
 *
 * 노드 클릭 이벤트를 처리한다.
 * 클릭된 노드의 메타데이터를 조회하고 MetadataOpener에 전달한다.
 *
 * L2 파이프라인: ClickReceiver → MetaLookup → InfoPanel / FallbackDisplay
 *               InfoPanel → MetaOpenTrigger, SourceJump
 *               ClickReceiver → HighlightManager
 */

import * as vscode from 'vscode';
import { GddGraph, NodeMeta } from '../graphEngine/types';
import { GraphStore } from '../graphEngine/graphStore';
import { openMetadata } from './metadataOpener';

export class NodeInteraction {
  constructor(
    private readonly _graphStore: GraphStore,
    private readonly _workspaceRoot: string
  ) {}

  /**
   * ClickReceiver + MetaLookup: nodeClick 메시지를 처리한다.
   * 노드 메타를 조회하여 MetadataOpener 또는 SourceJump를 실행한다.
   */
  async handleNodeClick(nodeId: string, graph: GddGraph): Promise<void> {
    const nodeMeta = this.findNodeMeta(nodeId, graph);

    if (!nodeMeta) {
      // FallbackDisplay: 메타 없는 노드 — ID만 표시
      vscode.window.showInformationMessage(`Node: ${nodeId} (no metadata)`);
      return;
    }

    // MetaOpenTrigger: meta.yaml를 Split Editor로 열기
    await openMetadata(nodeId, graph.filePath, this._workspaceRoot);
  }

  /**
   * SourceJump: source_file이 있으면 해당 소스 파일을 연다.
   */
  async jumpToSource(nodeId: string, graph: GddGraph): Promise<void> {
    const nodeMeta = this.findNodeMeta(nodeId, graph);
    if (!nodeMeta?.sourceFile) {
      vscode.window.showWarningMessage(`Node "${nodeId}" has no source_file.`);
      return;
    }

    const sourceUri = vscode.Uri.joinPath(
      vscode.Uri.file(this._workspaceRoot),
      nodeMeta.sourceFile
    );

    try {
      const doc = await vscode.workspace.openTextDocument(sourceUri);
      await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
    } catch {
      vscode.window.showWarningMessage(`Source file not found: ${nodeMeta.sourceFile}`);
    }
  }

  /**
   * MetaLookup: 그래프 내에서 노드 ID로 NodeMeta를 검색한다.
   */
  private findNodeMeta(nodeId: string, graph: GddGraph): NodeMeta | undefined {
    const node = graph.nodes.find(n => n.id === nodeId);
    return node?.meta;
  }
}
