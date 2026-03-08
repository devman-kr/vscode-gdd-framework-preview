# CLAUDE.md

## Project Overview

**vscode-gdd-framework-preview** — GDD(Graph-Driven Development) Framework를 위한 VSCode 확장 프로그램.
`.mermaid` 그래프 파일을 시각화하고, 노드 클릭으로 메타데이터 조회, 레이어 간 탐색(drill-down/back)을 지원한다.

- GDD Framework v0.2 기반
- 언어: TypeScript
- 기술 스택: VSCode Extension API, Mermaid.js, yaml

## GDD (Graph-Driven Development)

이 프로젝트 자체가 GDD 방법론을 따른다. **그래프가 단일 진실 원천(Single Source of Truth)**이다.

핵심 규칙:
- **Graph First, Code Second** — 코드 작성 전 반드시 그래프에 노드를 추가한다.
- 소스 코드에는 `@gdd-node` 어노테이션을 포함해야 한다.
- `.mermaid` 파일과 `.meta.yaml` 파일은 항상 1:1 쌍으로 존재한다.
- GDD 스펙 문서: `.docs/GDD-Framework-v0.2.md`

## Architecture (L0)

4개 도메인으로 구성:

| 도메인 | 설명 | 하위 그래프 |
|--------|------|-------------|
| **Extension** | VSCode 확장 진입점, 명령 등록, Provider 초기화 | - |
| **GraphEngine** | .mermaid/.meta.yaml 파싱, GDD 트리 구조 관리 | `graph/graph-engine/` |
| **Viewer** | Mermaid.js 그래프 시각화, 노드 인터랙션, 레이어 탐색 | `graph/viewer/` |
| **Preview** | .mermaid 파일 에디터 프리뷰 (Markdown Preview 스타일) | `graph/preview/` |

의존성 흐름: Extension → GraphEngine, Viewer, Preview / Viewer, Preview → GraphEngine

## Project Structure

```
.gdd.yaml                        # GDD 프로젝트 설정
.docs/GDD-Framework-v0.2.md      # GDD 프레임워크 스펙 문서
graph/
  L0-system.mermaid               # 시스템 전체 조감도
  L0-system.meta.yaml             # L0 메타데이터
  graph-engine/                   # GraphEngine 도메인
    L1-graph-engine.mermaid
    L1-graph-engine.meta.yaml
  viewer/                         # Viewer 도메인
    L1-viewer.mermaid
    L1-viewer.meta.yaml
    L2-navigation.mermaid
    L2-navigation.meta.yaml
  preview/                        # Preview 도메인
    L1-preview.mermaid
    L1-preview.meta.yaml
src/                              # 소스 코드 (구현 예정)
```

## Graph Levels

- **L0**: 시스템 전체 도메인 맵 (노드 최대 10개)
- **L1**: 도메인 내부 기능 흐름 (노드 최대 12개)
- **L2**: 기능의 구현 단위 (노드 최대 15개)

## Conventions

- 노드 네이밍: PascalCase
- 엣지에는 항상 label 포함
- 고아 노드(orphan) 금지
- 순환 의존성 금지
- 동기화 강제 수준: warn (경고만)

## Key Source Files (planned)

GraphEngine 도메인:
- `src/graphEngine/fileScanner.ts` — graph/ 디렉토리 탐색
- `src/graphEngine/mermaidParser.ts` — .mermaid 파싱
- `src/graphEngine/metaParser.ts` — .meta.yaml 파싱
- `src/graphEngine/treeBuilder.ts` — GddGraph 객체 조립
- `src/graphEngine/graphStore.ts` — 그래프 캐시/조회

Viewer 도메인:
- `src/viewer/webviewManager.ts` — WebviewPanel 관리
- `src/viewer/mermaidRenderer.ts` — Mermaid.js 렌더링
- `src/viewer/nodeInteraction.ts` — 노드 클릭 처리
- `src/viewer/navigation.ts` — 레이어 간 이동, NavigationStack
- `src/viewer/metadataOpener.ts` — Split Editor로 meta.yaml 열기

Preview 도메인:
- `src/preview/fileDetector.ts` — .mermaid 파일 활성화 감지
- `src/preview/previewPanel.ts` — 프리뷰 WebviewPanel

## AI Context Strategy

작업 시 `.gdd.yaml`의 `ai_context` 설정에 따라 컨텍스트를 제공한다:
- 항상 포함: `graph/L0-system.mermaid`, `graph/L0-system.meta.yaml`
- 최대 컨텍스트 파일 수: 8개
- 작업 대상 도메인의 L1/L2 그래프와 메타 파일을 함께 참조한다.