/**
 * @gdd-node GraphStore
 * @gdd-graph graph-engine/L1-graph-engine.mermaid
 *
 * 빌드된 GddGraph 객체를 인메모리 캐시에 저장하고,
 * 경로/노드 기반 조회와 계층 탐색 기능을 제공한다.
 *
 * L2 파이프라인: RegisterGraph → GraphCache → QueryByPath, QueryByNode, TreeIndex → ResultProvider
 *               InvalidateEvent → GraphCache
 */

import * as vscode from 'vscode';
import { GddGraph, FileChangeEvent, GraphFilePair } from './types';
import { FileScanner } from './fileScanner';
import { parseMermaidFile } from './mermaidParser';
import { parseMetaFile } from './metaParser';
import { buildGraph } from './treeBuilder';

/**
 * TreeIndex: L0→L1→L2 계층 구조를 색인한다.
 */
interface TreeIndexEntry {
  graph: GddGraph;
  children: string[]; // child graph의 filePath 목록
  parent?: string;    // parent graph의 filePath
}

export class GraphStore implements vscode.Disposable {
  /** GraphCache: Map 기반 인메모리 저장 (키: graph/ 기준 상대 경로) */
  private readonly _cache = new Map<string, GddGraph>();
  /** TreeIndex: 계층 색인 */
  private readonly _treeIndex = new Map<string, TreeIndexEntry>();
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly _fileScanner: FileScanner) {
    // InvalidateEvent: FileScanner의 변경 이벤트를 수신하여 캐시를 무효화한다.
    this._disposables.push(
      this._fileScanner.onDidChange(event => this.handleChange(event))
    );
  }

  /**
   * 전체 그래프를 빌드하여 캐시에 저장한다.
   */
  async initialize(): Promise<void> {
    const pairs = this._fileScanner.pairs;
    for (const pair of pairs) {
      await this.buildAndRegister(pair);
    }
    this.rebuildTreeIndex();
  }

  /**
   * RegisterGraph: 파일 쌍으로부터 GddGraph를 빌드하여 캐시에 등록한다.
   */
  private async buildAndRegister(pair: GraphFilePair): Promise<GddGraph | undefined> {
    try {
      const [mermaid, meta] = await Promise.all([
        parseMermaidFile(pair.mermaidPath),
        parseMetaFile(pair.metaPath),
      ]);

      const graph = buildGraph(mermaid, meta, pair.relativePath);
      this._cache.set(pair.relativePath, graph);

      // 검증 경고 출력
      for (const err of graph.validationErrors) {
        const prefix = err.level === 'error' ? 'ERROR' : 'WARN';
        console.warn(`[GDD ${prefix}] ${pair.relativePath}: ${err.message}`);
      }

      return graph;
    } catch (error) {
      console.error(`[GDD GraphStore] Failed to build graph for ${pair.relativePath}:`, error);
      return undefined;
    }
  }

  /**
   * InvalidateEvent 핸들러: 파일 변경 시 캐시를 무효화하고 재빌드한다.
   */
  private async handleChange(event: FileChangeEvent): Promise<void> {
    const { type, pair } = event;

    if (type === 'deleted') {
      this._cache.delete(pair.relativePath);
    } else {
      // created 또는 changed: 재빌드
      await this.buildAndRegister(pair);
    }

    this.rebuildTreeIndex();
  }

  /**
   * TreeIndex 재구성: parent_graph/child_graph 관계를 기반으로 트리를 구성한다.
   */
  private rebuildTreeIndex(): void {
    this._treeIndex.clear();

    // 1단계: 모든 그래프에 대한 엔트리 생성
    for (const [filePath, graph] of this._cache) {
      this._treeIndex.set(filePath, {
        graph,
        children: [],
        parent: graph.parentGraph?.replace(/\\/g, '/'),
      });
    }

    // 2단계: parent-child 관계 설정
    for (const [filePath, entry] of this._treeIndex) {
      if (entry.parent) {
        // parent의 상대 경로를 현재 그래프 기준으로 해석
        const parentEntry = this.findParentEntry(filePath, entry.parent);
        if (parentEntry) {
          parentEntry.children.push(filePath);
        }
      }
    }
  }

  private findParentEntry(childPath: string, parentRef: string): TreeIndexEntry | undefined {
    // parentRef가 "../L0-system.mermaid" 같은 상대 경로일 수 있음
    // childPath를 기준으로 해석
    const childParts = childPath.split('/');
    childParts.pop(); // 파일명 제거

    const parentParts = parentRef.replace('.mermaid', '').split('/');
    const resolved: string[] = [...childParts];

    for (const part of parentParts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.') {
        resolved.push(part);
      }
    }

    const resolvedPath = resolved.join('/');
    return this._treeIndex.get(resolvedPath);
  }

  // ─── ResultProvider: 조회 API ───

  /**
   * QueryByPath: .mermaid 파일의 상대 경로로 GddGraph를 조회한다.
   */
  getGraph(filePath: string): GddGraph | undefined {
    return this._cache.get(filePath);
  }

  /**
   * QueryByNode: 노드 ID로 해당 노드가 포함된 GddGraph를 조회한다.
   */
  getGraphByNodeId(nodeId: string): GddGraph | undefined {
    for (const graph of this._cache.values()) {
      if (graph.nodes.some(n => n.id === nodeId)) {
        return graph;
      }
    }
    return undefined;
  }

  /**
   * getChildren: 특정 그래프의 자식 그래프 목록을 반환한다.
   */
  getChildren(filePath: string): GddGraph[] {
    const entry = this._treeIndex.get(filePath);
    if (!entry) {
      return [];
    }
    return entry.children
      .map(childPath => this._cache.get(childPath))
      .filter((g): g is GddGraph => g !== undefined);
  }

  /**
   * getParent: 특정 그래프의 부모 그래프를 반환한다.
   */
  getParent(filePath: string): GddGraph | undefined {
    const entry = this._treeIndex.get(filePath);
    if (!entry?.parent) {
      return undefined;
    }
    return this.findParentGraph(filePath, entry.parent);
  }

  private findParentGraph(childPath: string, parentRef: string): GddGraph | undefined {
    const entry = this.findParentEntry(childPath, parentRef);
    return entry?.graph;
  }

  /** 전체 캐시된 그래프 목록을 반환한다. */
  getAllGraphs(): GddGraph[] {
    return Array.from(this._cache.values());
  }

  /** 캐시 크기를 반환한다. */
  get size(): number {
    return this._cache.size;
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
    this._cache.clear();
    this._treeIndex.clear();
  }
}
