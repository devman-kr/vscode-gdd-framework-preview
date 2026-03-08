/**
 * @gdd-node MermaidRenderer
 * @gdd-graph viewer/L1-viewer.mermaid
 *
 * Webview 내에서 Mermaid.js를 사용하여 그래프를 렌더링한다.
 * 노드 클릭/더블클릭 이벤트를 감지하여 Extension에 전달한다.
 *
 * L2 파이프라인: GraphDataReceiver → NodeDecorator → ThemeResolver → RenderEngine → SvgInjector → ClickBinder → MessageSender
 *               RenderEngine → ErrorOverlay (실패 시)
 */

import { NodeMeta } from '../graphEngine/types';

/**
 * Webview 내부에서 실행될 렌더러 스크립트를 생성한다.
 * WebviewManager가 HTML에 인라인으로 삽입한다.
 */
export function getMermaidRendererScript(
  mermaidText: string,
  nodeMetaMap: Record<string, NodeMeta>,
  hasParent: boolean
): string {
  return `
(async function() {
  const vscode = acquireVsCodeApi();
  const container = document.getElementById('graph-container');
  const infoPanel = document.getElementById('info-panel');
  const btnBack = document.getElementById('btn-back');
  const nodeMeta = ${JSON.stringify(nodeMetaMap)};
  const mermaidText = ${JSON.stringify(mermaidText)};
  const hasParent = ${JSON.stringify(hasParent)};

  // ── BackButton 핸들러 ──
  if (btnBack) {
    btnBack.addEventListener('click', function() {
      if (hasParent) {
        vscode.postMessage({ type: 'back' });
      }
    });
  }

  // ── NodeDecorator: 메타 기반 classDef/class 주입 ──
  function decorateText(text) {
    const lines = [text];
    const statusStyles = {
      active:  'fill:#2d7d46,stroke:#1b5e2e,color:#fff',
      planned: 'fill:#5b5b5b,stroke:#888,color:#ddd',
      wip:     'fill:#b8860b,stroke:#996b00,color:#fff',
      done:    'fill:#1a6b8a,stroke:#13506a,color:#fff',
    };

    const usedStatuses = new Set();
    const drillableNodes = [];

    for (const [nodeId, meta] of Object.entries(nodeMeta)) {
      if (meta.status && statusStyles[meta.status]) {
        usedStatuses.add(meta.status);
        lines.push('class ' + nodeId + ' status_' + meta.status);
      }
      if (meta.childGraph) {
        drillableNodes.push(nodeId);
      }
    }

    for (const status of usedStatuses) {
      lines.push('classDef status_' + status + ' ' + statusStyles[status]);
    }

    if (drillableNodes.length > 0) {
      lines.push('classDef drillable stroke-width:2px,stroke-dasharray:5 5');
      for (const id of drillableNodes) {
        lines.push('class ' + id + ' drillable');
      }
    }

    return lines.join('\\n');
  }

  // ── ThemeResolver: VSCode 테마 감지 ──
  const isDark = document.body.classList.contains('vscode-dark')
    || document.body.classList.contains('vscode-high-contrast');
  const theme = isDark ? 'dark' : 'default';

  // ── RenderEngine: mermaid.initialize + mermaid.render ──
  mermaid.initialize({
    startOnLoad: false,
    theme: theme,
    securityLevel: 'loose',
  });

  const decorated = decorateText(mermaidText);

  try {
    const { svg } = await mermaid.render('gdd-viewer-graph', decorated);
    // ── SvgInjector: DOM에 SVG 삽입 ──
    container.innerHTML = svg;

    // ── ClickBinder: 노드 이벤트 등록 ──
    bindNodeEvents();
  } catch (err) {
    // ── ErrorOverlay: 렌더링 에러 표시 ──
    container.innerHTML = '<div class="error">Mermaid rendering error:\\n' +
      (err.message || String(err)).replace(/</g, '&lt;') + '</div>';
  }

  // ── HighlightManager: 선택 노드 강조 ──
  let selectedNodeId = null;

  function highlightNode(nodeId) {
    // 이전 선택 해제
    if (selectedNodeId) {
      const prev = document.getElementById('flowchart-' + selectedNodeId);
      if (prev) { prev.classList.remove('node-selected'); }
    }
    selectedNodeId = nodeId;
    const el = document.getElementById('flowchart-' + nodeId);
    if (el) { el.classList.add('node-selected'); }
  }

  function bindNodeEvents() {
    const svgNodes = container.querySelectorAll('.node');
    let clickTimer = null;

    for (const svgNode of svgNodes) {
      const nodeId = extractNodeId(svgNode);
      if (!nodeId) { continue; }

      // drillable 표시
      const meta = nodeMeta[nodeId];
      if (meta && meta.childGraph) {
        svgNode.classList.add('node-drillable');
      }

      svgNode.addEventListener('click', function(e) {
        e.stopPropagation();
        // 더블클릭과 구분하기 위해 딜레이
        if (clickTimer) { clearTimeout(clickTimer); }
        clickTimer = setTimeout(function() {
          clickTimer = null;
          highlightNode(nodeId);
          showInfoPanel(nodeId);
          // ── MessageSender: nodeClick 전달 ──
          vscode.postMessage({ type: 'nodeClick', nodeId: nodeId });
        }, 200);
      });

      svgNode.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        // ── MessageSender: nodeDblClick 전달 ──
        vscode.postMessage({ type: 'nodeDblClick', nodeId: nodeId });
      });
    }
  }

  function extractNodeId(svgNode) {
    const id = svgNode.id || '';
    // mermaid는 "flowchart-NodeId-0" 형태로 ID를 생성
    const match = id.match(/^flowchart-(.+?)(-\\d+)?$/);
    return match ? match[1] : null;
  }

  // ── InfoPanel: 노드 메타 정보 표시 ──
  function showInfoPanel(nodeId) {
    const meta = nodeMeta[nodeId];
    if (!infoPanel) { return; }

    if (!meta) {
      infoPanel.innerHTML = '<div class="meta-row"><span class="meta-label">Node:</span>' + nodeId + '</div>';
      infoPanel.style.display = 'block';
      return;
    }

    let html = '';
    html += '<div class="meta-row"><span class="meta-label">Node:</span><strong>' + nodeId + '</strong></div>';
    if (meta.description) {
      html += '<div class="meta-row"><span class="meta-label">Description:</span>' + escapeHtml(meta.description) + '</div>';
    }
    if (meta.status) {
      html += '<div class="meta-row"><span class="meta-label">Status:</span>' + meta.status + '</div>';
    }
    if (meta.owner) {
      html += '<div class="meta-row"><span class="meta-label">Owner:</span>' + meta.owner + '</div>';
    }
    if (meta.sourceFile) {
      html += '<div class="meta-row"><span class="meta-label">Source:</span>' + escapeHtml(meta.sourceFile) + '</div>';
    }
    if (meta.childGraph) {
      html += '<div class="meta-row"><span class="meta-label">Child Graph:</span>' + escapeHtml(meta.childGraph) + '</div>';
    }

    html += '<div class="actions">';
    html += '<button onclick="vscode.postMessage({type:\\'nodeClick\\',nodeId:\\'' + nodeId + '\\'})">Open Meta</button>';
    if (meta.sourceFile) {
      html += '<button onclick="vscode.postMessage({type:\\'nodeClick\\',nodeId:\\'' + nodeId + '\\'})">Go to Source</button>';
    }
    if (meta.childGraph) {
      html += '<button onclick="vscode.postMessage({type:\\'nodeDblClick\\',nodeId:\\'' + nodeId + '\\'})">Drill Down</button>';
    }
    html += '</div>';

    infoPanel.innerHTML = html;
    infoPanel.style.display = 'block';
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 빈 영역 클릭 시 info panel 숨김
  document.addEventListener('click', function(e) {
    if (infoPanel && !e.target.closest('.node') && !e.target.closest('#info-panel')) {
      infoPanel.style.display = 'none';
      if (selectedNodeId) {
        const prev = document.getElementById('flowchart-' + selectedNodeId);
        if (prev) { prev.classList.remove('node-selected'); }
        selectedNodeId = null;
      }
    }
  });
})();
`;
}
