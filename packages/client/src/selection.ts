import { parseOid } from '@alara/core/shared';
import type { ElementTarget } from '@alara/core/shared';
import type { EditorStore } from './store.js';
import { editorBehaviorsRegistry, type BehaviorContext } from './behaviors/registry.js';

/**
 * Find the closest element with an oid attribute from a target element.
 */
function findEditableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('[oid]') as HTMLElement | null;
}

/**
 * Parse element target from oid attribute.
 * Returns partial ElementTarget (without CSS info for now).
 */
function parseElementTarget(element: HTMLElement): ElementTarget | null {
  const oid = element.getAttribute('oid');
  if (!oid) return null;

  const parsed = parseOid(oid);
  if (!parsed) return null;

  // Return partial target (CSS editing support will be added later)
  return {
    file: parsed.file,
    lineNumber: parsed.lineNumber,
    column: parsed.column,
    cssFile: '',
    selectors: [],
  };
}

/**
 * Create a behavior context from the store for behavior handlers.
 */
function createBehaviorContext(store: EditorStore): BehaviorContext {
  return {
    selectElement: store.getState().selectElement,
    clearSelection: store.getState().clearSelection,
    startTextEditing: store.getState().startTextEditing,
    commitTextEdit: store.getState().commitTextEdit,
    cancelTextEditing: store.getState().cancelTextEditing,
    getTextEditState: store.getState().getTextEditState,
  };
}

/**
 * Attach selection event handlers to the document.
 * Returns a cleanup function to remove handlers.
 */
export function attachSelectionHandlers(store: EditorStore): () => void {
  const abortController = new AbortController();
  const { signal } = abortController;

  // Click to select
  const handleClick = (e: MouseEvent) => {
    // Don't handle if clicking on overlay elements
    if ((e.target as HTMLElement).closest('[data-alara-overlay]')) {
      return;
    }

    // Don't handle if currently editing
    const { textEdit } = store.getState();
    if (textEdit.isEditing) {
      return;
    }

    const element = findEditableElement(e.target);

    if (element) {
      e.preventDefault();
      e.stopPropagation();

      const target = parseElementTarget(element);
      const behavior = editorBehaviorsRegistry.getPrimaryBehavior(element);
      const ctx = createBehaviorContext(store);

      if (behavior?.onClick) {
        behavior.onClick(element, e, ctx);
      } else {
        // Default: select the element
        store.getState().selectElement(element, target);
      }
    } else {
      // Clicked outside any editable element
      store.getState().clearSelection();
    }
  };

  // Double-click for text editing
  const handleDoubleClick = (e: MouseEvent) => {
    const element = findEditableElement(e.target);
    if (!element) return;

    const behavior = editorBehaviorsRegistry.getPrimaryBehavior(element);
    if (behavior?.onDoubleClick) {
      const ctx = createBehaviorContext(store);
      behavior.onDoubleClick(element, e, ctx);
    }
  };

  // Hover to show hover overlay
  const handleMouseMove = (e: MouseEvent) => {
    // Don't hover if text editing is active
    const { textEdit } = store.getState();
    if (textEdit.isEditing) {
      return;
    }

    const element = findEditableElement(e.target);
    const currentHovered = store.getState().hoveredElement;

    if (element) {
      // Only update if different element
      if (currentHovered?.element !== element) {
        store.getState().hoverElement(element);
      }
    } else if (currentHovered) {
      store.getState().clearHover();
    }
  };

  // Clear hover when mouse leaves the document
  const handleMouseLeave = () => {
    store.getState().clearHover();
  };

  // Add event listeners with capture phase
  document.addEventListener('click', handleClick, { capture: true, signal });
  document.addEventListener('dblclick', handleDoubleClick, { capture: true, signal });
  document.addEventListener('mousemove', handleMouseMove, { capture: true, signal });
  document.addEventListener('mouseleave', handleMouseLeave, { capture: true, signal });

  // Return cleanup function
  return () => {
    abortController.abort();
  };
}
