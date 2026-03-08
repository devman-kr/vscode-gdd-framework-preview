/**
 * @gdd-node Navigation
 * @gdd-graph viewer/L1-viewer.mermaid
 *
 * 레이어 간 이동(drill-down, back)을 관리한다.
 * NavigationStack으로 경로 히스토리를 유지한다.
 *
 * L2 파이프라인: NodeDblClick → ChildResolver → NavigationStack → StateManager → WebviewUpdate
 *               BackButton, ParentNode → NavigationStack
 */

import * as path from 'path';
import { GddGraph, NodeMeta } from '../graphEngine/types';
import { GraphStore } from '../graphEngine/graphStore';
import { WebviewManager } from './webviewManager';

export class Navigation {
  /** NavigationStack: 방문한 그래프 경로 스택 */
  private readonly _stack: string[] = [];

  constructor(
    private readonly _graphStore: GraphStore,
    private readonly _webviewManager: WebviewManager
  ) {}

  /**
   * 초기 그래프를 설정하고 스택을 초기화한다.
   */
  navigateTo(graphPath: string): boolean {
    const graph = this._graphStore.getGraph(graphPath);
    if (!graph) { return false; }

    this._stack.length = 0;
    this._stack.push(graphPath);
    this._webviewManager.show(graph);
    return true;
  }

  /**
   * NodeDblClick + ChildResolver: 노드 더블클릭 시 child_graph로 drill-down한다.
   * child_graph 경로를 현재 그래프 파일 위치 기준으로 절대 경로로 resolve한다.
   */
  drillDown(nodeId: string, currentGraph: GddGraph): boolean {
    const node = currentGraph.nodes.find(n => n.id === nodeId);
    if (!node?.meta.childGraph) { return false; }

    // ChildResolver: child_graph 상대 경로를 해석
    const childRelPath = this.resolveChildPath(currentGraph.filePath, node.meta.childGraph);
    const childGraph = this._graphStore.getGraph(childRelPath);
    if (!childGraph) { return false; }

    // NavigationStack push
    this._stack.push(childRelPath);

    // StateManager → WebviewUpdate
    this._webviewManager.updateContent(childGraph);
    return true;
  }

  /**
   * BackButton / ParentNode: 이전 레이어로 돌아간다.
   */
  goBack(): boolean {
    if (this._stack.length <= 1) { return false; }

    // NavigationStack pop
    this._stack.pop();
    const prevPath = this._stack[this._stack.length - 1];
    const prevGraph = this._graphStore.getGraph(prevPath);
    if (!prevGraph) { return false; }

    // StateManager → WebviewUpdate
    this._webviewManager.updateContent(prevGraph);
    return true;
  }

  /** 현재 스택의 깊이를 반환한다. */
  get depth(): number {
    return this._stack.length;
  }

  /** 현재 표시 중인 그래프 경로를 반환한다. */
  get currentPath(): string | undefined {
    return this._stack.length > 0 ? this._stack[this._stack.length - 1] : undefined;
  }

  /**
   * ChildResolver: child_graph의 상대 경로를 현재 그래프 기준으로 해석한다.
   * 예: currentFilePath="viewer/L1-viewer", childRef="L2-navigation.mermaid"
   *   → "viewer/L2-navigation"
   */
  private resolveChildPath(currentFilePath: string, childRef: string): string {
    const currentDir = currentFilePath.split('/').slice(0, -1).join('/');
    const childClean = childRef.replace(/\.mermaid$/, '');

    const parts = childClean.split('/');
    const resolved: string[] = currentDir ? currentDir.split('/') : [];

    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.') {
        resolved.push(part);
      }
    }

    return resolved.join('/');
  }
}
