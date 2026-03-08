/**
 * @gdd-node FileDetector
 * @gdd-graph preview/L1-preview.mermaid
 *
 * VSCode의 activeTextEditor 변경 이벤트를 감시하여
 * .mermaid 파일이 활성화되었는지 감지하고, 컨텍스트를 설정한다.
 *
 * L2 파이프라인: EditorListener → ExtChecker → MetaProbe → ContextSet → EventEmitter
 *               ExtChecker → ContextReset (non-.mermaid)
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface MermaidFileEvent {
  uri: vscode.Uri;
  hasMeta: boolean;
}

export class FileDetector implements vscode.Disposable {
  /** EventEmitter: .mermaid 파일 활성화 시 이벤트를 발행한다. */
  private readonly _onMermaidFileActivated = new vscode.EventEmitter<MermaidFileEvent>();
  readonly onMermaidFileActivated = this._onMermaidFileActivated.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor() {
    // EditorListener: onDidChangeActiveTextEditor 이벤트를 구독한다.
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => this.handleEditorChange(editor))
    );

    // 초기화 시 현재 활성 에디터도 확인
    this.handleEditorChange(vscode.window.activeTextEditor);
  }

  /**
   * ExtChecker: 활성 에디터의 파일 확장자가 .mermaid인지 판별한다.
   */
  private async handleEditorChange(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!editor || editor.document.uri.scheme !== 'file') {
      await this.resetContext();
      return;
    }

    const fsPath = editor.document.uri.fsPath;
    if (!fsPath.endsWith('.mermaid')) {
      // ContextReset: .mermaid 파일이 아닐 때 컨텍스트를 해제한다.
      await this.resetContext();
      return;
    }

    // MetaProbe: 동명 .meta.yaml 파일이 존재하는지 확인한다.
    const hasMeta = await this.probeMetaFile(fsPath);

    // ContextSet: gdd.mermaidActive = true, gdd.hasMeta 설정
    await vscode.commands.executeCommand('setContext', 'gdd.mermaidActive', true);
    await vscode.commands.executeCommand('setContext', 'gdd.hasMeta', hasMeta);

    // EventEmitter: 이벤트 발행
    this._onMermaidFileActivated.fire({
      uri: editor.document.uri,
      hasMeta,
    });
  }

  /**
   * MetaProbe: .mermaid 파일과 동일 이름의 .meta.yaml 파일 존재 여부를 확인한다.
   */
  private async probeMetaFile(mermaidPath: string): Promise<boolean> {
    const metaPath = mermaidPath.replace(/\.mermaid$/, '.meta.yaml');
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(metaPath));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ContextReset: gdd.mermaidActive = false 로 설정한다.
   */
  private async resetContext(): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'gdd.mermaidActive', false);
    await vscode.commands.executeCommand('setContext', 'gdd.hasMeta', false);
  }

  dispose(): void {
    this._onMermaidFileActivated.dispose();
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables.length = 0;
  }
}
