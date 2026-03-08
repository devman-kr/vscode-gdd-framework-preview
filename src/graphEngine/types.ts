/**
 * @gdd-node GraphEngine
 * @gdd-graph graph-engine/L1-graph-engine.mermaid
 *
 * GraphEngine 도메인 공통 타입 정의.
 * L1/L2 메타데이터의 contract 기반으로 설계.
 */

import * as vscode from 'vscode';

// ─── FileScanner 출력 ───

export interface GraphFilePair {
  mermaidPath: string;
  metaPath: string;
  /** graph/ 디렉토리 기준 상대 경로 (예: "graph-engine/L1-graph-engine") */
  relativePath: string;
}

export interface FileChangeEvent {
  type: 'created' | 'changed' | 'deleted';
  pair: GraphFilePair;
}

// ─── MermaidParser 출력 ───

export type GraphDirection = 'TD' | 'LR' | 'RL' | 'BT';
export type NodeShape = 'rect' | 'round' | 'diamond' | 'hexagon' | 'stadium' | 'default';
export type EdgeStyle = 'solid' | 'dotted';

export interface MermaidNode {
  id: string;
  label: string;
  shape: NodeShape;
}

export interface MermaidEdge {
  from: string;
  to: string;
  label: string;
  style: EdgeStyle;
}

export interface ParsedMermaid {
  direction: GraphDirection;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
  rawText: string;
}

// ─── MetaParser 출력 ───

export interface MetaHeader {
  graph: string;
  level: number;
  parentNode?: string;
  parentGraph?: string;
  description: string;
  lastUpdated?: string;
}

export interface NodeMeta {
  id: string;
  owner?: string;
  status?: string;
  description?: string;
  sourceFile?: string;
  childGraph?: string;
  /** child_graph의 절대 경로 (ChildGraphResolver가 해석) */
  childGraphAbsolutePath?: string;
  /** 기타 커스텀 필드 */
  extra?: Record<string, unknown>;
}

export interface EdgeMeta {
  from: string;
  to: string;
  label?: string;
  type?: string;
  contract?: string;
}

export interface ParsedMeta {
  header: MetaHeader;
  nodes: NodeMeta[];
  edges: EdgeMeta[];
}

// ─── TreeBuilder 출력 (GDD 그래프 모델) ───

export interface GddNode {
  id: string;
  label: string;
  shape: NodeShape;
  meta: NodeMeta;
}

export interface GddEdge {
  from: string;
  to: string;
  label: string;
  type?: string;
  contract?: string;
  style: EdgeStyle;
}

export interface ValidationError {
  level: 'error' | 'warning';
  message: string;
  nodeId?: string;
}

export interface GddGraph {
  /** .mermaid 파일의 graph/ 기준 상대 경로 */
  filePath: string;
  direction: GraphDirection;
  level: number;
  parentNode?: string;
  parentGraph?: string;
  description: string;
  nodes: GddNode[];
  edges: GddEdge[];
  /** child_graph를 가진 노드 ID → 자식 그래프 상대 경로 맵 */
  childGraphMap: Map<string, string>;
  validationErrors: ValidationError[];
  rawMermaid: string;
}
