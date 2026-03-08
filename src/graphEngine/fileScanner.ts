/**
 * @gdd-node FileScanner
 * @gdd-graph graph-engine/L1-graph-engine.mermaid
 *
 * 워크스페이스의 graph/ 디렉토리를 재귀적으로 탐색하여
 * .mermaid와 .meta.yaml 파일 쌍을 발견하고, 파일 변경을 감시한다.
 *
 * L2 파이프라인: ConfigLoader → DirWalker → ExtFilter → PairMatcher → FileWatcher → ChangeEmitter
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { GraphFilePair, FileChangeEvent } from './types';

const MERMAID_EXT = '.mermaid';
const META_EXT = '.meta.yaml';

/**
 * ConfigLoader: .gdd.yaml에서 graph 디렉토리 경로를 읽어 탐색 루트를 결정한다.
 */
async function loadGraphDirectory(workspaceRoot: string): Promise<string> {
  const gddYamlPath = path.join(workspaceRoot, '.gdd.yaml');
  try {
    const content = await vscode.workspace.fs.readFile(vscode.Uri.file(gddYamlPath));
    const text = Buffer.from(content).toString('utf-8');
    // yaml 파싱 대신 간단히 graph.directory 추출
    const match = text.match(/directory:\s*"?([^"\n]+)"?/);
    if (match) {
      return match[1].trim().replace(/\/+$/, '');
    }
  } catch {
    // .gdd.yaml이 없으면 기본값 사용
  }
  return 'graph';
}

/**
 * DirWalker: 지정된 디렉토리를 재귀적으로 순회하며 모든 파일 URI를 수집한다.
 */
async function walkDirectory(dirUri: vscode.Uri): Promise<vscode.Uri[]> {
  const results: vscode.Uri[] = [];
  const entries = await vscode.workspace.fs.readDirectory(dirUri);

  for (const [name, type] of entries) {
    const childUri = vscode.Uri.joinPath(dirUri, name);
    if (type === vscode.FileType.Directory) {
      const subFiles = await walkDirectory(childUri);
      results.push(...subFiles);
    } else if (type === vscode.FileType.File) {
      results.push(childUri);
    }
  }

  return results;
}

/**
 * ExtFilter: 수집된 파일 목록에서 .mermaid와 .meta.yaml 확장자를 분류한다.
 */
function filterByExtension(files: vscode.Uri[]): {
  mermaidFiles: vscode.Uri[];
  metaFiles: vscode.Uri[];
} {
  const mermaidFiles: vscode.Uri[] = [];
  const metaFiles: vscode.Uri[] = [];

  for (const file of files) {
    const fsPath = file.fsPath;
    if (fsPath.endsWith(META_EXT)) {
      metaFiles.push(file);
    } else if (fsPath.endsWith(MERMAID_EXT)) {
      mermaidFiles.push(file);
    }
  }

  return { mermaidFiles, metaFiles };
}

/**
 * PairMatcher: 같은 이름의 .mermaid와 .meta.yaml 파일을 1:1 쌍으로 매칭한다.
 */
function matchPairs(
  mermaidFiles: vscode.Uri[],
  metaFiles: vscode.Uri[],
  graphDirPath: string
): { pairs: GraphFilePair[]; missing: string[] } {
  const metaByBase = new Map<string, vscode.Uri>();
  for (const meta of metaFiles) {
    // "L1-graph-engine.meta.yaml" → "L1-graph-engine"
    const base = path.basename(meta.fsPath).replace(META_EXT, '');
    const dir = path.dirname(meta.fsPath);
    metaByBase.set(path.join(dir, base), meta);
  }

  const pairs: GraphFilePair[] = [];
  const missing: string[] = [];
  const matchedMetaBases = new Set<string>();

  for (const mermaid of mermaidFiles) {
    const base = path.basename(mermaid.fsPath).replace(MERMAID_EXT, '');
    const dir = path.dirname(mermaid.fsPath);
    const key = path.join(dir, base);

    const meta = metaByBase.get(key);
    if (meta) {
      const relPath = path.relative(graphDirPath, mermaid.fsPath)
        .replace(/\\/g, '/')
        .replace(MERMAID_EXT, '');
      pairs.push({
        mermaidPath: mermaid.fsPath,
        metaPath: meta.fsPath,
        relativePath: relPath,
      });
      matchedMetaBases.add(key);
    } else {
      missing.push(`Missing .meta.yaml for: ${mermaid.fsPath}`);
    }
  }

  // meta.yaml만 있고 mermaid가 없는 경우
  for (const [key, meta] of metaByBase) {
    if (!matchedMetaBases.has(key)) {
      missing.push(`Missing .mermaid for: ${meta.fsPath}`);
    }
  }

  return { pairs, missing };
}

/**
 * FileScanner 클래스.
 * graph/ 디렉토리를 스캔하고, 파일 변경을 감시하여 이벤트를 발행한다.
 */
export class FileScanner implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<FileChangeEvent>();
  readonly onDidChange = this._onDidChange.event;

  private _watcher: vscode.FileSystemWatcher | undefined;
  private _graphDirPath = '';
  private _pairs: GraphFilePair[] = [];
  private _disposables: vscode.Disposable[] = [];

  constructor(private readonly workspaceRoot: string) {}

  /**
   * 초기 스캔을 수행하고 파일 감시를 시작한다.
   */
  async initialize(): Promise<GraphFilePair[]> {
    const graphDir = await loadGraphDirectory(this.workspaceRoot);
    this._graphDirPath = path.join(this.workspaceRoot, graphDir);

    // 초기 스캔
    const { pairs, missing } = await this.scan();
    this._pairs = pairs;

    // MissingReport: 쌍 없는 파일 경고
    for (const msg of missing) {
      console.warn(`[GDD FileScanner] ${msg}`);
    }

    // FileWatcher + ChangeEmitter 설정
    this.setupWatcher(graphDir);

    return pairs;
  }

  /**
   * graph/ 디렉토리를 스캔하여 파일 쌍을 반환한다.
   */
  async scan(): Promise<{ pairs: GraphFilePair[]; missing: string[] }> {
    const dirUri = vscode.Uri.file(this._graphDirPath);
    const allFiles = await walkDirectory(dirUri);
    const { mermaidFiles, metaFiles } = filterByExtension(allFiles);
    return matchPairs(mermaidFiles, metaFiles, this._graphDirPath);
  }

  /**
   * FileWatcher: VSCode FileSystemWatcher를 설정한다.
   * ChangeEmitter: 파일 변경 감지 시 onDidChange 이벤트를 발행한다.
   */
  private setupWatcher(graphDir: string): void {
    const pattern = new vscode.RelativePattern(
      this.workspaceRoot,
      `${graphDir}/**/*.{mermaid,yaml}`
    );

    this._watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this._disposables.push(
      this._watcher.onDidCreate(uri => this.handleFileChange('created', uri)),
      this._watcher.onDidChange(uri => this.handleFileChange('changed', uri)),
      this._watcher.onDidDelete(uri => this.handleFileChange('deleted', uri)),
      this._watcher
    );
  }

  private handleFileChange(type: FileChangeEvent['type'], uri: vscode.Uri): void {
    const fsPath = uri.fsPath;

    // 해당 파일이 속한 pair를 찾거나, 새로 생성된 경우 임시 pair 생성
    const pair = this.findPairForFile(fsPath);
    if (pair) {
      this._onDidChange.fire({ type, pair });
    }
  }

  private findPairForFile(fsPath: string): GraphFilePair | undefined {
    return this._pairs.find(
      p => p.mermaidPath === fsPath || p.metaPath === fsPath
    );
  }

  /** 현재 스캔된 파일 쌍 목록을 반환한다. */
  get pairs(): readonly GraphFilePair[] {
    return this._pairs;
  }

  /** 파일 쌍 목록을 갱신한다. */
  async refresh(): Promise<GraphFilePair[]> {
    const { pairs, missing } = await this.scan();
    this._pairs = pairs;
    for (const msg of missing) {
      console.warn(`[GDD FileScanner] ${msg}`);
    }
    return pairs;
  }

  dispose(): void {
    this._onDidChange.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
  }
}
