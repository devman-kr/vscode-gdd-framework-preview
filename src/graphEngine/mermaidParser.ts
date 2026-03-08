/**
 * @gdd-node MermaidParser
 * @gdd-graph graph-engine/L1-graph-engine.mermaid
 *
 * .mermaid 파일 텍스트를 파싱하여 노드 ID, 레이블, 엣지 정보, 스타일을 추출한다.
 *
 * L2 파이프라인: FileReader → DirectionParser, LineSplitter → NodeExtractor, EdgeExtractor → StyleClassifier → ResultAssembler
 */

import * as vscode from 'vscode';
import {
  GraphDirection,
  NodeShape,
  EdgeStyle,
  MermaidNode,
  MermaidEdge,
  ParsedMermaid,
} from './types';

// ─── 정규식 패턴 ───

/** 노드 정의 패턴들 (ID[label], ID(label), ID{label}, ID([label]), ID[[label]]) */
const NODE_PATTERNS = [
  // ID["label"] or ID[label]
  { regex: /(\w+)\["([^"]+)"\]/, shape: 'rect' as NodeShape },
  { regex: /(\w+)\[([^\]]+)\]/, shape: 'rect' as NodeShape },
  // ID("label") or ID(label) — stadium shape
  { regex: /(\w+)\("([^"]+)"\)/, shape: 'stadium' as NodeShape },
  { regex: /(\w+)\(([^)]+)\)/, shape: 'round' as NodeShape },
  // ID{"label"} or ID{label} — diamond
  { regex: /(\w+)\{"([^"]+)"\}/, shape: 'diamond' as NodeShape },
  { regex: /(\w+)\{([^}]+)\}/, shape: 'diamond' as NodeShape },
  // ID[/"label"/] — trapezoid (외부 시스템 표기)
  { regex: /(\w+)\[\/"([^"]+)"\/\]/, shape: 'hexagon' as NodeShape },
];

/** 엣지 패턴: A -->|label| B, A -.->|label| B, A --> B, A -.-> B */
const EDGE_REGEX = /(\w+)\s+(-->|-.->)\s*(?:\|([^|]*)\|)?\s*(\w+)/;

// ─── 파싱 함수 ───

/**
 * DirectionParser: 첫 줄의 graph 키워드 뒤 방향을 추출한다.
 */
function parseDirection(text: string): GraphDirection {
  const match = text.match(/^\s*graph\s+(TD|LR|RL|BT)/im);
  return (match?.[1] as GraphDirection) ?? 'TD';
}

/**
 * LineSplitter: 텍스트를 줄 단위로 분할하고, 주석(%%)과 빈 줄을 제거한다.
 */
function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('%%'));
}

/**
 * NodeExtractor: 각 라인에서 노드 정의를 정규식으로 추출한다.
 */
function extractNodes(lines: string[]): MermaidNode[] {
  const nodeMap = new Map<string, MermaidNode>();

  for (const line of lines) {
    // graph 키워드 라인은 스킵
    if (/^\s*graph\s/i.test(line)) {
      continue;
    }

    for (const { regex, shape } of NODE_PATTERNS) {
      // 라인에서 모든 노드 매치 (엣지 라인에도 노드 정의가 포함될 수 있음)
      let remaining = line;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(remaining)) !== null) {
        const id = match[1];
        const rawLabel = match[2];
        // <br/> 태그를 줄바꿈으로 대체한 레이블
        const label = rawLabel.replace(/<br\s*\/?>/gi, '\n');

        if (!nodeMap.has(id)) {
          nodeMap.set(id, { id, label, shape });
        }

        remaining = remaining.slice(match.index + match[0].length);
      }
    }
  }

  return Array.from(nodeMap.values());
}

/**
 * EdgeExtractor + StyleClassifier:
 * 각 라인에서 엣지 정의를 추출하고, 실선/점선 스타일을 분류한다.
 */
function extractEdges(lines: string[]): MermaidEdge[] {
  const edges: MermaidEdge[] = [];

  for (const line of lines) {
    if (/^\s*graph\s/i.test(line)) {
      continue;
    }

    let remaining = line;
    let match: RegExpExecArray | null;

    while ((match = EDGE_REGEX.exec(remaining)) !== null) {
      const from = match[1];
      const arrow = match[2];
      const label = match[3]?.trim() ?? '';
      const to = match[4];

      // StyleClassifier: 점선(-.->)은 이벤트/비동기 관계
      const style: EdgeStyle = arrow === '-.>' ? 'dotted' : 'solid';

      edges.push({ from, to, label, style });

      remaining = remaining.slice(match.index + match[0].length);
    }
  }

  return edges;
}

// ─── 공개 API ───

/**
 * .mermaid 파일 텍스트를 파싱하여 ParsedMermaid 객체를 반환한다.
 */
export function parseMermaidText(text: string): ParsedMermaid {
  const direction = parseDirection(text);
  const lines = splitLines(text);
  const nodes = extractNodes(lines);
  const edges = extractEdges(lines);

  return { direction, nodes, edges, rawText: text };
}

/**
 * FileReader: .mermaid 파일을 읽고 파싱하여 ParsedMermaid를 반환한다.
 */
export async function parseMermaidFile(filePath: string): Promise<ParsedMermaid> {
  const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  const text = Buffer.from(content).toString('utf-8');
  return parseMermaidText(text);
}
