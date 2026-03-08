/**
 * @gdd-node TreeBuilder
 * @gdd-graph graph-engine/L1-graph-engine.mermaid
 *
 * MermaidParser와 MetaParser의 결과를 병합하고, 정합성을 검증한 뒤,
 * parent-child 계층 구조를 갖는 GddGraph 객체를 생성한다.
 *
 * L2 파이프라인: InputReceiver → NodeMerger, EdgeMerger → Validator → HierarchyLinker → GraphAssembler
 */

import {
  ParsedMermaid,
  ParsedMeta,
  GddNode,
  GddEdge,
  GddGraph,
  ValidationError,
} from './types';

/**
 * NodeMerger: ParsedMermaid의 노드와 ParsedMeta의 노드 메타데이터를
 * 노드 ID 기준으로 병합하여 GddNode를 생성한다.
 */
function mergeNodes(mermaid: ParsedMermaid, meta: ParsedMeta): GddNode[] {
  const metaMap = new Map(meta.nodes.map(n => [n.id, n]));

  return mermaid.nodes.map(mNode => {
    const nodeMeta = metaMap.get(mNode.id) ?? { id: mNode.id };
    return {
      id: mNode.id,
      label: mNode.label,
      shape: mNode.shape,
      meta: nodeMeta,
    };
  });
}

/**
 * EdgeMerger: ParsedMermaid의 엣지와 ParsedMeta의 엣지 메타데이터를
 * from-to 기준으로 병합하여 GddEdge를 생성한다.
 */
function mergeEdges(mermaid: ParsedMermaid, meta: ParsedMeta): GddEdge[] {
  const edgeMetaMap = new Map(
    meta.edges.map(e => [`${e.from}->${e.to}`, e])
  );

  return mermaid.edges.map(mEdge => {
    const key = `${mEdge.from}->${mEdge.to}`;
    const edgeMeta = edgeMetaMap.get(key);

    return {
      from: mEdge.from,
      to: mEdge.to,
      label: mEdge.label || edgeMeta?.label || '',
      type: edgeMeta?.type,
      contract: edgeMeta?.contract,
      style: mEdge.style,
    };
  });
}

/**
 * Validator: .mermaid에 정의된 노드와 .meta.yaml에 정의된 노드 목록이
 * 일치하는지 검증한다.
 */
function validate(
  mermaidNodes: ParsedMermaid,
  meta: ParsedMeta,
  mergedNodes: GddNode[],
  mergedEdges: GddEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const mermaidNodeIds = new Set(mermaidNodes.nodes.map(n => n.id));
  const metaNodeIds = new Set(meta.nodes.map(n => n.id));

  // mermaid-meta 불일치: meta에 있지만 mermaid에 없는 노드
  for (const id of metaNodeIds) {
    if (!mermaidNodeIds.has(id)) {
      errors.push({
        level: 'warning',
        message: `Node "${id}" is defined in .meta.yaml but not in .mermaid`,
        nodeId: id,
      });
    }
  }

  // mermaid에 있지만 meta에 없는 노드
  for (const id of mermaidNodeIds) {
    if (!metaNodeIds.has(id)) {
      errors.push({
        level: 'warning',
        message: `Node "${id}" is defined in .mermaid but has no metadata in .meta.yaml`,
        nodeId: id,
      });
    }
  }

  // 고아 노드 검사: 엣지가 하나도 없는 노드
  const connectedNodes = new Set<string>();
  for (const edge of mergedEdges) {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  }
  for (const node of mergedNodes) {
    if (!connectedNodes.has(node.id)) {
      errors.push({
        level: 'warning',
        message: `Orphan node: "${node.id}" has no edges`,
        nodeId: node.id,
      });
    }
  }

  return errors;
}

/**
 * HierarchyLinker: meta의 parent_graph, parent_node, child_graph 정보를 기반으로
 * child_graph 맵을 생성한다.
 */
function buildChildGraphMap(nodes: GddNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    if (node.meta.childGraph) {
      map.set(node.id, node.meta.childGraph);
    }
  }
  return map;
}

// ─── 공개 API ───

/**
 * ParsedMermaid와 ParsedMeta를 결합하여 GddGraph 객체를 생성한다.
 *
 * @param mermaid MermaidParser의 출력
 * @param meta MetaParser의 출력
 * @param filePath .mermaid 파일의 graph/ 기준 상대 경로
 */
export function buildGraph(
  mermaid: ParsedMermaid,
  meta: ParsedMeta,
  filePath: string
): GddGraph {
  // NodeMerger + EdgeMerger
  const nodes = mergeNodes(mermaid, meta);
  const edges = mergeEdges(mermaid, meta);

  // Validator
  const validationErrors = validate(mermaid, meta, nodes, edges);

  // HierarchyLinker
  const childGraphMap = buildChildGraphMap(nodes);

  // GraphAssembler
  return {
    filePath,
    direction: mermaid.direction,
    level: meta.header.level,
    parentNode: meta.header.parentNode,
    parentGraph: meta.header.parentGraph,
    description: meta.header.description,
    nodes,
    edges,
    childGraphMap,
    validationErrors,
    rawMermaid: mermaid.rawText,
  };
}
