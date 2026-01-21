import type { EditorStore } from './store.js';
import { editorBehaviorsRegistry, type BehaviorContext } from './behaviors/registry.js';

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
 * Attach text editing event handlers to the document.
 * Returns a cleanup function to remove handlers.
 */
export function attachTextEditHandlers(store: EditorStore): () => void {
  const abortController = new AbortController();
  const { signal } = abortController;

  // Handle keyboard events for text editing
  const handleKeyDown = (e: KeyboardEvent) => {
    const { textEdit } = store.getState();
    if (!textEdit.isEditing || !textEdit.element) {
      return;
    }

    const element = textEdit.element;
    const behavior = editorBehaviorsRegistry.getPrimaryBehavior(element);

    if (behavior?.onKeyDown) {
      const ctx = createBehaviorContext(store);
      behavior.onKeyDown(element, e, ctx);
    }
  };

  // Handle focusout for text editing commit
  // Using focusout instead of blur because focusout bubbles up
  const handleFocusOut = (e: FocusEvent) => {
    const { textEdit } = store.getState();
    if (!textEdit.isEditing || !textEdit.element) {
      return;
    }

    // Check if the focus left the editing element
    if (e.target === textEdit.element) {
      const element = textEdit.element;
      const behavior = editorBehaviorsRegistry.getPrimaryBehavior(element);

      if (behavior?.onBlur) {
        const ctx = createBehaviorContext(store);
        behavior.onBlur(element, e, ctx);
      }
    }
  };

  // Add event listeners with capture phase
  document.addEventListener('keydown', handleKeyDown, { capture: true, signal });
  // Use focusout instead of blur - it bubbles properly
  document.addEventListener('focusout', handleFocusOut, { capture: true, signal });

  // Return cleanup function
  return () => {
    abortController.abort();
  };
}
