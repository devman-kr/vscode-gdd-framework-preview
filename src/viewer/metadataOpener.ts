/**
 * @gdd-node MetadataOpener
 * @gdd-graph viewer/L1-viewer.mermaid
 *
 * 노드 클릭 시 해당 노드의 .meta.yaml 파일을 VSCode Split Editor로 연다.
 *
 * L2 파이프라인: OpenRequest → MetaPathResolver → FileExistChecker → SplitOpener → NodeHighlighter
 *               FileExistChecker → ErrorNotify (파일 없음)
 */

import * as vscode from 'vscode';

/**
 * OpenRequest: 노드 ID와 그래프 경로를 받아 meta.yaml을 Split Editor로 연다.
 */
export async function openMetadata(
  nodeId: string,
  graphRelPath: string,
  workspaceRoot: string
): Promise<void> {
  // MetaPathResolver: .mermaid → .meta.yaml 변환
  const metaRelPath = graphRelPath + '.meta.yaml';
  const mermaidRelPath = graphRelPath + '.mermaid';

  // graph/ 디렉토리 기준 경로를 워크스페이스 절대 경로로 변환
  const metaUri = vscode.Uri.joinPath(
    vscode.Uri.file(workspaceRoot),
    'graph',
    metaRelPath
  );

  // FileExistChecker: 파일 존재 확인
  try {
    await vscode.workspace.fs.stat(metaUri);
  } catch {
    // ErrorNotify: meta.yaml 누락 경고
    vscode.window.showWarningMessage(
      `Meta file not found: graph/${metaRelPath}`
    );
    return;
  }

  // SplitOpener: Split Editor로 meta.yaml 열기
  const doc = await vscode.workspace.openTextDocument(metaUri);
  const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

  // NodeHighlighter: 해당 노드 섹션으로 커서 이동
  await highlightNodeInMeta(editor, nodeId);
}

/**
 * NodeHighlighter: 열린 meta.yaml에서 노드 ID가 정의된 라인을 찾아 커서를 이동한다.
 */
async function highlightNodeInMeta(
  editor: vscode.TextEditor,
  nodeId: string
): Promise<void> {
  const text = editor.document.getText();
  // meta.yaml에서 "  NodeId:" 형태의 노드 정의를 찾는다
  const pattern = new RegExp(`^  ${nodeId}:`, 'm');
  const match = pattern.exec(text);

  if (!match) { return; }

  const pos = editor.document.positionAt(match.index);
  const range = new vscode.Range(pos, pos);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}
