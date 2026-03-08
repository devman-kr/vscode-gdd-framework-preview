# GDD Framework Preview

GDD(Graph-Driven Development) Framework를 위한 VSCode 확장 프로그램입니다.

`.mermaid` 그래프 파일을 시각화하고, 노드 클릭으로 메타데이터를 조회하며, 레이어 간 탐색(drill-down/back)을 지원합니다.

## GDD란?

**Graph-Driven Development** — 그래프를 단일 진실 원천(Single Source of Truth)으로 삼는 개발 방법론입니다.

- **Graph First, Code Second**: 코드 작성 전 반드시 그래프에 노드를 추가합니다.
- `.mermaid` 파일과 `.meta.yaml` 파일이 항상 1:1 쌍으로 존재합니다.
- 소스 코드에는 `@gdd-node` 어노테이션을 포함합니다.
- 자세한 스펙: [GDD Framework v0.2](.docs/GDD-Framework-v0.2.md)

## 주요 기능

| 기능 | 설명 |
|------|------|
| **Preview** | `.mermaid` 파일을 에디터에서 열면 타이틀바 아이콘으로 실시간 프리뷰 실행 |
| **Viewer** | Mermaid.js 기반 그래프 시각화, 노드 클릭/더블클릭 인터랙션 |
| **Navigation** | 노드 더블클릭으로 하위 레이어(L0→L1→L2) drill-down / back 탐색 |
| **Metadata** | 노드 클릭 시 Split Editor에서 `.meta.yaml` 메타데이터 조회 |

## 아키텍처

```
Extension (진입점)
  ├──→ GraphEngine   .mermaid/.meta.yaml 파싱, GDD 트리 관리
  ├──→ Viewer        그래프 시각화, 노드 인터랙션, 레이어 탐색
  └──→ Preview       .mermaid 파일 에디터 프리뷰
```

그래프 레벨 구조:
- **L0** — 시스템 전체 도메인 맵 (노드 최대 10개)
- **L1** — 도메인 내부 기능 흐름 (노드 최대 12개)
- **L2** — 기능의 구현 단위 (노드 최대 15개)

## 프로젝트 구조

```
.gdd.yaml                          # GDD 프로젝트 설정
.docs/                              # GDD 프레임워크 스펙 문서
graph/                              # GDD 그래프 정의
  L0-system.mermaid / .meta.yaml      시스템 전체 조감도
  graph-engine/                       GraphEngine 도메인 (L1 + L2 x5)
  viewer/                             Viewer 도메인 (L1 + L2 x5)
  preview/                            Preview 도메인 (L1 + L2 x4)
src/                                # 소스 코드
  extension.ts                        VSCode 확장 진입점
  graphEngine/                        파일 스캔, 파싱, 트리 빌드, 캐시
  viewer/                             WebviewPanel, 렌더링, 네비게이션
  preview/                            파일 감지, 프리뷰 패널
```

## 사용법

### 활성화 조건

워크스페이스 루트에 `.gdd.yaml` 파일이 존재하면 자동 활성화됩니다.

### 명령어

| 명령어 | 설명 |
|--------|------|
| `GDD: Open Graph Preview` | 현재 `.mermaid` 파일의 프리뷰 열기 |
| `GDD: Open Graph Viewer` | 그래프 뷰어 열기 (인터랙션 + 네비게이션) |

`.mermaid` 파일이 활성화되면 에디터 타이틀바에 아이콘이 표시됩니다.

## 기술 스택

- TypeScript
- VSCode Extension API (^1.85.0)
- Mermaid.js (Webview 내 렌더링)
- YAML (yaml ^2.4.0)

## 개발

```bash
npm install         # 의존성 설치
npm run compile     # TypeScript 컴파일
npm run watch       # 변경 감지 자동 컴파일
```

## 라이선스

MIT
