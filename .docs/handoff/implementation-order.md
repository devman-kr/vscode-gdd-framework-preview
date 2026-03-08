# 구현 작업 순서 (GDD 의존성 기반)

> 작성일: 2026-03-07
> 기준: L0-system.mermaid 의존성 흐름 + 각 L1 내부 파이프라인 순서

의존성 하류(downstream)부터 올라가는 순서로 구성한다.
모든 도메인이 GraphEngine에 의존하므로 이것이 최우선이다.

---

## Phase 1 — GraphEngine (데이터 레이어)

**의존성**: 없음 (최하류)
**L1 파이프라인**: `FileScanner → MermaidParser, MetaParser → TreeBuilder → GraphStore`

| 순서 | 대상 | L2 그래프 | source_file | 비고 |
|------|------|----------|-------------|------|
| 1-1 | FileScanner | `graph/graph-engine/L2-file-scanner.mermaid` | `src/graphEngine/fileScanner.ts` | |
| 1-2 | MermaidParser | `graph/graph-engine/L2-mermaid-parser.mermaid` | `src/graphEngine/mermaidParser.ts` | 1-3과 병렬 가능 |
| 1-3 | MetaParser | `graph/graph-engine/L2-meta-parser.mermaid` | `src/graphEngine/metaParser.ts` | 1-2와 병렬 가능 |
| 1-4 | TreeBuilder | `graph/graph-engine/L2-tree-builder.mermaid` | `src/graphEngine/treeBuilder.ts` | 1-2, 1-3 완료 후 |
| 1-5 | GraphStore | `graph/graph-engine/L2-graph-store.mermaid` | `src/graphEngine/graphStore.ts` | |

---

## Phase 2 — Preview (단순 프리뷰)

**의존성**: GraphEngine (파싱 결과 요청)
**L1 파이프라인**: `FileDetector → TitleBarIcon → PreviewPanel → MermaidRenderer`
**선정 이유**: Viewer보다 스코프가 작고, MermaidRenderer 코드를 Viewer에서 재사용할 수 있음

| 순서 | 대상 | L2 그래프 | source_file | 비고 |
|------|------|----------|-------------|------|
| 2-1 | FileDetector | `graph/preview/L2-file-detector.mermaid` | `src/preview/fileDetector.ts` | |
| 2-2 | TitleBarIcon | `graph/preview/L2-title-bar-icon.mermaid` | (package.json contribution) | |
| 2-3 | PreviewPanel | `graph/preview/L2-preview-panel.mermaid` | `src/preview/previewPanel.ts` | |
| 2-4 | MermaidRenderer | `graph/preview/L2-mermaid-renderer.mermaid` | (Webview 내부 스크립트) | |

---

## Phase 3 — Viewer (인터랙션 + 네비게이션)

**의존성**: GraphEngine (그래프 데이터 조회), Preview의 MermaidRenderer 재사용
**L1 파이프라인**: `WebviewManager → MermaidRenderer → NodeInteraction, Navigation → MetadataOpener`

| 순서 | 대상 | L2 그래프 | source_file | 비고 |
|------|------|----------|-------------|------|
| 3-1 | WebviewManager | `graph/viewer/L2-webview-manager.mermaid` | `src/viewer/webviewManager.ts` | |
| 3-2 | MermaidRenderer | `graph/viewer/L2-mermaid-renderer.mermaid` | `src/viewer/mermaidRenderer.ts` | |
| 3-3 | NodeInteraction | `graph/viewer/L2-node-interaction.mermaid` | `src/viewer/nodeInteraction.ts` | 3-4와 병렬 가능 |
| 3-4 | Navigation | `graph/viewer/L2-navigation.mermaid` | `src/viewer/navigation.ts` | 3-3과 병렬 가능 |
| 3-5 | MetadataOpener | `graph/viewer/L2-metadata-opener.mermaid` | `src/viewer/metadataOpener.ts` | |

---

## Phase 4 — Extension (진입점, 모든 도메인 조립)

**의존성**: GraphEngine, Viewer, Preview (전체)
**설명**: L0의 Extension 노드. `activate()` 함수에서 3개 도메인을 초기화하고 커맨드를 등록한다.

| 순서 | 대상 | source_file | 비고 |
|------|------|-------------|------|
| 4-1 | Extension activate | `src/extension.ts` | L1 그래프 필요 시 별도 생성 |

> Phase 1~3 완료 후 진행. 필요 시 Extension의 L1 그래프를 추가로 설계한다.

---

## 병렬 작업 요약

```
Phase 1:  1-1 → [1-2 ∥ 1-3] → 1-4 → 1-5
Phase 2:  2-1 → 2-2 → 2-3 → 2-4
Phase 3:  3-1 → 3-2 → [3-3 ∥ 3-4] → 3-5
Phase 4:  4-1
```

## 참조 그래프

- L0: `graph/L0-system.mermaid`
- GraphEngine L1: `graph/graph-engine/L1-graph-engine.mermaid`
- Preview L1: `graph/preview/L1-preview.mermaid`
- Viewer L1: `graph/viewer/L1-viewer.mermaid`
