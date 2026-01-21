import type { Plugin } from 'vite';
import { transformSync } from '@babel/core';
import { babelPluginOid } from './babel-plugin-oid.ts';

export interface AlaraPluginOptions {
  /** Alara server port (default: 4000) */
  serverPort?: number;
}

const VIRTUAL_CLIENT_ID = '/@alara/client';
const RESOLVED_VIRTUAL_CLIENT_ID = '\0@alara/client';

export function alaraPlugin(options: AlaraPluginOptions = {}): Plugin {
  const serverPort = options.serverPort ?? 4000;
  let projectRoot = process.cwd();

  return {
    name: 'alara',
    enforce: 'pre',

    configResolved(config) {
      projectRoot = config.root;
    },

    transform(code: string, id: string) {
      // Only transform TSX/JSX in src/
      if (
        !id.includes('/src/') ||
        (!id.endsWith('.tsx') && !id.endsWith('.jsx'))
      ) {
        return null;
      }

      // Skip node_modules
      if (id.includes('node_modules')) {
        return null;
      }

      // Transform with Babel to inject oid attributes
      const result = transformSync(code, {
        filename: id,
        plugins: [
          ['@babel/plugin-syntax-typescript', { isTSX: true }],
          [babelPluginOid, { root: projectRoot }],
        ],
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
        sourceMaps: true,
        // Don't transform ES modules - let Vite/esbuild handle that
        presets: [],
      });

      if (!result || !result.code) {
        return null;
      }

      return {
        code: result.code,
        map: result.map,
      };
    },

    // Inject Alara client script into HTML
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [
          {
            tag: 'script',
            attrs: { type: 'module', src: VIRTUAL_CLIENT_ID },
            injectTo: 'head',
          },
        ],
      };
    },

    // Resolve virtual module for client script
    resolveId(id: string) {
      if (id === VIRTUAL_CLIENT_ID) {
        return RESOLVED_VIRTUAL_CLIENT_ID;
      }
    },

    // Serve the client script
    load(id: string) {
      if (id === RESOLVED_VIRTUAL_CLIENT_ID) {
        return generateClientScript(serverPort);
      }
    },
  };
}

function generateClientScript(port: number): string {
  return `
const ALARA_WS_URL = 'ws://localhost:${port}/ws';

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 1000;

// ============================================================================
// State
// ============================================================================

let selectedElement = null;
let hoveredElement = null;
let isEditing = false;
let editingElement = null;
let originalText = '';

// ============================================================================
// Overlay Elements
// ============================================================================

const selectionOverlay = document.createElement('div');
selectionOverlay.id = 'alara-selection-overlay';
selectionOverlay.setAttribute('data-alara-overlay', 'true');
selectionOverlay.style.cssText = \`
  position: fixed;
  pointer-events: none;
  border: 2px solid #2196F3;
  background: rgba(33, 150, 243, 0.1);
  z-index: 99999;
  display: none;
\`;

const tagLabel = document.createElement('div');
tagLabel.style.cssText = \`
  position: absolute;
  top: -22px;
  left: -2px;
  background: #2196F3;
  color: white;
  font-size: 11px;
  font-family: system-ui, sans-serif;
  padding: 2px 6px;
  border-radius: 3px 3px 0 0;
  white-space: nowrap;
\`;
selectionOverlay.appendChild(tagLabel);

const hoverOverlay = document.createElement('div');
hoverOverlay.id = 'alara-hover-overlay';
hoverOverlay.setAttribute('data-alara-overlay', 'true');
hoverOverlay.style.cssText = \`
  position: fixed;
  pointer-events: none;
  border: 1px dashed #90CAF9;
  background: rgba(33, 150, 243, 0.05);
  z-index: 99998;
  display: none;
\`;

document.addEventListener('DOMContentLoaded', () => {
  document.body.appendChild(selectionOverlay);
  document.body.appendChild(hoverOverlay);
});

// ============================================================================
// Overlay Positioning
// ============================================================================

function updateOverlay(overlay, element, label = null) {
  if (!element) {
    overlay.style.display = 'none';
    return;
  }

  const rect = element.getBoundingClientRect();
  overlay.style.display = 'block';
  overlay.style.top = rect.top + 'px';
  overlay.style.left = rect.left + 'px';
  overlay.style.width = rect.width + 'px';
  overlay.style.height = rect.height + 'px';

  if (label) {
    label.textContent = element.tagName.toLowerCase();
  }
}

function updateSelectionOverlay() {
  updateOverlay(selectionOverlay, selectedElement, tagLabel);
}

function updateHoverOverlay() {
  // Don't show hover on selected element
  if (hoveredElement === selectedElement) {
    hoverOverlay.style.display = 'none';
    return;
  }
  updateOverlay(hoverOverlay, hoveredElement);
}

// Update overlays on scroll/resize
window.addEventListener('scroll', () => {
  updateSelectionOverlay();
  updateHoverOverlay();
}, true);

window.addEventListener('resize', () => {
  updateSelectionOverlay();
  updateHoverOverlay();
});

// ============================================================================
// Event Handlers
// ============================================================================

const TEXT_EDITABLE_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'a', 'li', 'td', 'th'];

function findEditableElement(target) {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('[oid]');
}

function parseOid(oid) {
  const match = oid.match(/^(.+):(\\d+):(\\d+)$/);
  if (!match) return null;
  return {
    file: match[1],
    lineNumber: parseInt(match[2], 10),
    column: parseInt(match[3], 10)
  };
}

// Click to select
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-alara-overlay]')) return;
  if (isEditing) return;

  const element = findEditableElement(e.target);

  if (element) {
    e.preventDefault();
    e.stopPropagation();
    selectedElement = element;
    updateSelectionOverlay();
  } else {
    selectedElement = null;
    updateSelectionOverlay();
  }
}, true);

// Double-click to edit text
document.addEventListener('dblclick', (e) => {
  const element = findEditableElement(e.target);
  if (!element) return;

  const tagName = element.tagName.toLowerCase();
  if (!TEXT_EDITABLE_TAGS.includes(tagName)) return;

  e.preventDefault();
  e.stopPropagation();

  isEditing = true;
  editingElement = element;
  originalText = element.textContent || '';

  element.contentEditable = 'true';
  element.focus();

  // Select all text
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);

  // Hide overlays while editing
  selectionOverlay.style.display = 'none';
  hoverOverlay.style.display = 'none';
}, true);

// Hover
document.addEventListener('mousemove', (e) => {
  if (isEditing) return;

  const element = findEditableElement(e.target);
  if (element !== hoveredElement) {
    hoveredElement = element;
    updateHoverOverlay();
  }
}, true);

document.addEventListener('mouseleave', () => {
  hoveredElement = null;
  updateHoverOverlay();
}, true);

// Keyboard handling for text editing
document.addEventListener('keydown', (e) => {
  if (!isEditing || !editingElement) return;

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    commitEdit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelEdit();
  }
}, true);

// Blur handling
document.addEventListener('blur', (e) => {
  if (!isEditing || !editingElement) return;
  if (e.target === editingElement) {
    commitEdit();
  }
}, true);

function commitEdit() {
  if (!editingElement) return;

  const newText = editingElement.textContent || '';
  const oid = editingElement.getAttribute('oid');
  const parsed = parseOid(oid);

  editingElement.contentEditable = 'false';

  if (newText !== originalText && parsed && ws && ws.readyState === WebSocket.OPEN) {
    const request = {
      action: 'transform',
      id: 'edit-' + Date.now(),
      type: 'text-update',
      target: {
        file: parsed.file,
        lineNumber: parsed.lineNumber,
        column: parsed.column
      },
      change: {
        originalText: originalText,
        newText: newText
      }
    };
    console.log('[Alara] Sending text-update:', request);
    ws.send(JSON.stringify(request));
  }

  isEditing = false;
  editingElement = null;
  originalText = '';

  // Restore selection overlay
  updateSelectionOverlay();
}

function cancelEdit() {
  if (!editingElement) return;

  editingElement.textContent = originalText;
  editingElement.contentEditable = 'false';

  isEditing = false;
  editingElement = null;
  originalText = '';

  updateSelectionOverlay();
}

// ============================================================================
// WebSocket Connection
// ============================================================================

function connect() {
  ws = new WebSocket(ALARA_WS_URL);

  ws.onopen = () => {
    console.log('[Alara] Connected to dev server');
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[Alara] Received:', message);
    } catch (e) {
      console.error('[Alara] Failed to parse message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[Alara] Disconnected');
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log('[Alara] Reconnecting in ' + RECONNECT_DELAY + 'ms (attempt ' + reconnectAttempts + ')');
      setTimeout(connect, RECONNECT_DELAY);
    }
  };

  ws.onerror = (error) => {
    console.error('[Alara] WebSocket error:', error);
  };
}

// Expose for debugging
window.__ALARA_WS__ = () => ws;

// Connect on load
connect();
`;
}
