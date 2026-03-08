/**
 * @gdd-node MetaParser
 * @gdd-graph graph-engine/L1-graph-engine.mermaid
 *
 * .meta.yaml 파일을 파싱하여 레벨, 부모 관계, 노드별 메타데이터, 엣지 계약 정보를 추출한다.
 *
 * L2 파이프라인: YamlLoader → HeaderExtractor, NodeMetaExtractor, EdgeMetaExtractor
 *               → ContractResolver, ChildGraphResolver → ResultAssembler
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { MetaHeader, NodeMeta, EdgeMeta, ParsedMeta } from './types';

// ─── 파싱 함수 ───

/**
 * HeaderExtractor: meta 파일의 최상위 필드를 추출한다.
 */
function extractHeader(data: Record<string, unknown>): MetaHeader {
  return {
    graph: String(data.graph ?? ''),
    level: Number(data.level ?? 0),
    parentNode: data.parent_node as string | undefined,
    parentGraph: data.parent_graph as string | undefined,
    description: String(data.description ?? ''),
    lastUpdated: data.last_updated as string | undefined,
  };
}

/**
 * NodeMetaExtractor: nodes 섹션에서 각 노드의 메타데이터를 추출한다.
 */
function extractNodeMetas(nodesSection: Record<string, unknown> | undefined): NodeMeta[] {
  if (!nodesSection || typeof nodesSection !== 'object') {
    return [];
  }

  return Object.entries(nodesSection).map(([id, raw]) => {
    const data = raw as Record<string, unknown>;
    return {
      id,
      owner: data.owner as string | undefined,
      status: data.status as string | undefined,
      description: data.description as string | undefined,
      sourceFile: data.source_file as string | undefined,
      childGraph: data.child_graph as string | undefined,
      extra: extractExtraFields(data, [
        'owner', 'status', 'description', 'source_file', 'child_graph',
      ]),
    };
  });
}

/**
 * EdgeMetaExtractor: edges 섹션에서 각 엣지의 메타데이터를 추출한다.
 */
function extractEdgeMetas(edgesSection: unknown[] | undefined): EdgeMeta[] {
  if (!Array.isArray(edgesSection)) {
    return [];
  }

  return edgesSection.map(raw => {
    const data = raw as Record<string, unknown>;
    return resolveContract({
      from: String(data.from ?? ''),
      to: String(data.to ?? ''),
      label: data.label as string | undefined,
      type: data.type as string | undefined,
      contract: data.contract as string | undefined,
    });
  });
}

/**
 * ContractResolver: 엣지의 type과 contract 문자열을 정규화한다.
 */
function resolveContract(edge: EdgeMeta): EdgeMeta {
  // type이 없고 label만 있으면 기본 타입은 undefined (단순 연결)
  // type이 'requires'이면 contract가 있어야 의미가 있음
  return {
    ...edge,
    type: edge.type ?? undefined,
    contract: edge.contract?.trim() ?? undefined,
  };
}

/**
 * ChildGraphResolver: 노드의 child_graph 상대 경로를 절대 경로로 변환한다.
 */
function resolveChildGraphPaths(
  nodes: NodeMeta[],
  metaFilePath: string
): NodeMeta[] {
  const metaDir = path.dirname(metaFilePath);

  return nodes.map(node => {
    if (!node.childGraph) {
      return node;
    }
    const absolutePath = path.resolve(metaDir, node.childGraph);
    return { ...node, childGraphAbsolutePath: absolutePath };
  });
}

/**
 * 기본 필드를 제외한 나머지 커스텀 필드를 추출한다.
 */
function extractExtraFields(
  data: Record<string, unknown>,
  knownKeys: string[]
): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  let hasExtra = false;

  for (const [key, value] of Object.entries(data)) {
    if (!knownKeys.includes(key)) {
      extra[key] = value;
      hasExtra = true;
    }
  }

  return hasExtra ? extra : undefined;
}

// ─── 공개 API ───

/**
 * .meta.yaml 텍스트를 파싱하여 ParsedMeta 객체를 반환한다.
 * @param text YAML 텍스트
 * @param metaFilePath 메타 파일의 절대 경로 (child_graph 경로 해석용)
 */
export function parseMetaText(text: string, metaFilePath: string): ParsedMeta {
  const data = parseYaml(text) as Record<string, unknown>;

  const header = extractHeader(data);
  let nodes = extractNodeMetas(data.nodes as Record<string, unknown> | undefined);
  const edges = extractEdgeMetas(data.edges as unknown[] | undefined);

  // ChildGraphResolver: child_graph 경로를 절대 경로로 변환
  nodes = resolveChildGraphPaths(nodes, metaFilePath);

  return { header, nodes, edges };
}

/**
 * YamlLoader + ResultAssembler: .meta.yaml 파일을 읽고 파싱하여 ParsedMeta를 반환한다.
 */
export async function parseMetaFile(filePath: string): Promise<ParsedMeta> {
  const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  const text = Buffer.from(content).toString('utf-8');
  return parseMetaText(text, filePath);
}
