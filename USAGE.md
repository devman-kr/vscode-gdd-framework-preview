# GDD Framework Preview — 사용 가이드

## 이 프로젝트가 뭔가요?

**GDD(Graph-Driven Development) Framework**를 위한 VSCode 확장 프로그램입니다.
`.mermaid` 그래프 파일을 시각화하고, 노드 클릭으로 메타데이터를 조회하며, 레이어를 드릴다운(L0→L1→L2) 탐색할 수 있습니다.

## 핵심 개념: GDD 방법론

- **Graph First, Code Second** — 코드 작성 전 반드시 그래프(`.mermaid`)에 노드를 먼저 추가
- `.mermaid` 파일과 `.meta.yaml` 파일이 항상 **1:1 쌍**으로 존재
- 소스 코드에는 `@gdd-node` 어노테이션을 포함
- 그래프 레벨: **L0**(시스템 전체) → **L1**(도메인 내부) → **L2**(구현 단위)

## 설치 및 빌드

```bash
npm install          # 의존성 설치
npm run compile      # TypeScript 컴파일
npm run watch        # 변경 감지 자동 컴파일
```

VSCode에서 `F5`를 누르면 Extension Development Host가 열리며 확장을 테스트할 수 있습니다.

## 사용법

| 단계 | 설명 |
|------|------|
| **활성화** | 워크스페이스 루트에 `.gdd.yaml` 파일이 있으면 자동 활성화 |
| **Preview** | `.mermaid` 파일을 열면 에디터 타이틀바에 아이콘 표시 → 클릭 시 프리뷰 |
| **Viewer** | 커맨드 팔레트에서 `GDD: Open Graph Viewer` 실행 → 인터랙티브 그래프 |
| **탐색** | 노드 클릭 → `.meta.yaml` 메타데이터 조회 / 더블클릭 → 하위 레이어 drill-down |

## 프로젝트 구조

```
.gdd.yaml                    # GDD 프로젝트 설정 (활성화 트리거)
.docs/GDD-Framework-v0.2.md  # GDD 스펙 문서
graph/                        # 그래프 정의 (.mermaid + .meta.yaml 쌍)
  L0-system.*                   시스템 전체 조감도
  graph-engine/                 GraphEngine 도메인 (L1 + L2×5)
  viewer/                       Viewer 도메인 (L1 + L2×5)
  preview/                      Preview 도메인 (L1 + L2×4)
src/                          # TypeScript 소스 코드
  extension.ts                  VSCode 확장 진입점
  graphEngine/                  파싱, 트리 빌드, 캐시 (6개 모듈)
  viewer/                       WebviewPanel, 렌더링, 네비게이션 (5개 모듈)
  preview/                      파일 감지, 프리뷰 패널 (2개 모듈)
```

## 아키텍처 (L0)

```
Extension (진입점)
  ├──→ GraphEngine   .mermaid/.meta.yaml 파싱, GDD 트리 관리
  ├──→ Viewer        그래프 시각화, 노드 인터랙션, 레이어 탐색
  └──→ Preview       .mermaid 파일 에디터 프리뷰
```

Viewer와 Preview 모두 GraphEngine에 파싱을 요청하는 단방향 의존 구조입니다.

## 기여 시 지켜야 할 컨벤션

| 규칙 | 내용 |
|------|------|
| 노드 네이밍 | PascalCase |
| 엣지 | 반드시 label 포함 |
| 고아 노드 | 금지 (모든 노드는 연결되어야 함) |
| 순환 의존성 | 금지 |
| 레벨별 노드 상한 | L0: 10개, L1: 12개, L2: 15개 |

## 기술 스택

- **TypeScript** + VSCode Extension API (^1.85.0)
- **Mermaid.js** — Webview 내 그래프 렌더링
- **yaml** (^2.4.0) — `.meta.yaml` 파싱
