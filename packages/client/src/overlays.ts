import type { EditorStore } from './store.js';

// ============================================================================
// Overlay Elements
// ============================================================================

interface OverlayElements {
  container: HTMLDivElement;
  selection: HTMLDivElement;
  selectionLabel: HTMLDivElement;
  hover: HTMLDivElement;
  statusIndicator: HTMLDivElement;
}

/**
 * Create the overlay DOM elements.
 */
function createOverlayElements(): OverlayElements {
  // Container for all overlays
  const container = document.createElement('div');
  container.id = 'alara-overlays';
  container.setAttribute('data-alara-overlay', 'true');
  container.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:99999;';

  // Selection overlay
  const selection = document.createElement('div');
  selection.id = 'alara-selection';
  selection.setAttribute('data-alara-overlay', 'true');
  selection.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #2196F3;
    background: rgba(33, 150, 243, 0.1);
    display: none;
    box-sizing: border-box;
  `;

  // Selection tag label
  const selectionLabel = document.createElement('div');
  selectionLabel.style.cssText = `
    position: absolute;
    top: -22px;
    left: -2px;
    background: #2196F3;
    color: white;
    font-size: 11px;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 2px 6px;
    border-radius: 3px 3px 0 0;
    white-space: nowrap;
    line-height: 1.4;
  `;
  selection.appendChild(selectionLabel);

  // Hover overlay
  const hover = document.createElement('div');
  hover.id = 'alara-hover';
  hover.setAttribute('data-alara-overlay', 'true');
  hover.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 1px dashed #90CAF9;
    background: rgba(33, 150, 243, 0.05);
    display: none;
    box-sizing: border-box;
  `;

  // Connection status indicator
  const statusIndicator = document.createElement('div');
  statusIndicator.id = 'alara-status';
  statusIndicator.setAttribute('data-alara-overlay', 'true');
  statusIndicator.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: #333;
    color: white;
    font-size: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 8px 12px;
    border-radius: 6px;
    display: none;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 99999;
  `;

  container.appendChild(selection);
  container.appendChild(hover);
  container.appendChild(statusIndicator);

  return { container, selection, selectionLabel, hover, statusIndicator };
}

/**
 * Get the tag name to display for an element.
 */
function getTagName(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();

  // For custom components, try to get a more meaningful name
  if (element.dataset.component) {
    return element.dataset.component;
  }

  return tagName;
}

/**
 * Update an overlay element's position based on a target element.
 */
function updateOverlayPosition(overlay: HTMLElement, element: HTMLElement | null, label?: HTMLElement): void {
  if (!element) {
    overlay.style.display = 'none';
    return;
  }

  const rect = element.getBoundingClientRect();
  overlay.style.display = 'block';
  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;

  if (label) {
    label.textContent = getTagName(element);
  }
}

/**
 * Update status indicator based on connection status.
 */
function updateStatusIndicator(
  indicator: HTMLElement,
  status: string,
  error: string | null
): void {
  if (status === 'connected') {
    indicator.style.display = 'none';
    return;
  }

  indicator.style.display = 'block';

  switch (status) {
    case 'connecting':
      indicator.style.background = '#ff9800';
      indicator.textContent = 'Connecting to Alara...';
      break;
    case 'disconnected':
      indicator.style.background = '#666';
      indicator.textContent = 'Alara disconnected';
      break;
    case 'error':
      indicator.style.background = '#f44336';
      indicator.textContent = error ?? 'Connection error';
      break;
  }
}

/**
 * Render and manage overlay elements.
 * Returns a cleanup function.
 */
export function renderOverlays(store: EditorStore): () => void {
  const elements = createOverlayElements();
  const abortController = new AbortController();
  const { signal } = abortController;

  // Append to body when DOM is ready
  if (document.body) {
    document.body.appendChild(elements.container);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(elements.container);
    }, { once: true, signal });
  }

  // Subscribe to store changes
  const unsubscribe = store.subscribe((state) => {
    const { selectedElement, hoveredElement, textEdit, connectionStatus, connectionError } = state;

    // Update selection overlay
    if (textEdit.isEditing) {
      // Hide selection overlay while editing
      elements.selection.style.display = 'none';
    } else {
      updateOverlayPosition(
        elements.selection,
        selectedElement?.element ?? null,
        elements.selectionLabel
      );
    }

    // Update hover overlay
    if (textEdit.isEditing) {
      // Hide hover overlay while editing
      elements.hover.style.display = 'none';
    } else if (hoveredElement && hoveredElement.element !== selectedElement?.element) {
      updateOverlayPosition(elements.hover, hoveredElement.element);
    } else {
      elements.hover.style.display = 'none';
    }

    // Update status indicator
    updateStatusIndicator(elements.statusIndicator, connectionStatus, connectionError);
  });

  // Update overlays on scroll/resize
  const handleScrollResize = () => {
    store.getState().refreshBounds();
    const state = store.getState();

    if (!state.textEdit.isEditing) {
      updateOverlayPosition(
        elements.selection,
        state.selectedElement?.element ?? null,
        elements.selectionLabel
      );

      if (state.hoveredElement && state.hoveredElement.element !== state.selectedElement?.element) {
        updateOverlayPosition(elements.hover, state.hoveredElement.element);
      }
    }
  };

  window.addEventListener('scroll', handleScrollResize, { capture: true, signal });
  window.addEventListener('resize', handleScrollResize, { signal });

  // Return cleanup function
  return () => {
    abortController.abort();
    unsubscribe();
    elements.container.remove();
  };
}
