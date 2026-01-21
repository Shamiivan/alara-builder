import {
  editorBehaviorsRegistry,
  isTextEditableElement,
  type EditorBehavior,
  type BehaviorContext,
} from '../registry.js';

/**
 * Text Edit Behavior
 *
 * Handles inline text editing for text-content elements like
 * headings, paragraphs, spans, list items, etc.
 *
 * Flow:
 * 1. Double-click -> contentEditable = 'true', focus, select all
 * 2. Type to edit text
 * 3. Enter/blur -> commit changes to server
 * 4. Escape -> restore original text, cancel editing
 */
const textEditBehavior: EditorBehavior = {
  id: 'text-edit',
  name: 'Text Edit',
  priority: 10, // High priority for text elements

  appliesTo(element: HTMLElement): boolean {
    return isTextEditableElement(element);
  },

  onDoubleClick(element: HTMLElement, event: MouseEvent, ctx: BehaviorContext): void {
    event.preventDefault();
    event.stopPropagation();

    const oid = element.getAttribute('oid') ?? '';
    const originalText = element.textContent ?? '';

    // Make element editable
    element.contentEditable = 'true';
    element.focus();

    // Select all text
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Track editing state
    ctx.startTextEditing(element, originalText, oid);

    // Add visual indicator
    element.dataset.alaraEditing = 'true';
  },

  onKeyDown(element: HTMLElement, event: KeyboardEvent, ctx: BehaviorContext): void {
    const { isEditing, element: editingElement } = ctx.getTextEditState();

    if (!isEditing || editingElement !== element) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commitEdit(element, ctx);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit(element, ctx);
    }
  },

  onBlur(element: HTMLElement, _event: FocusEvent, ctx: BehaviorContext): void {
    const { isEditing, element: editingElement } = ctx.getTextEditState();

    if (!isEditing || editingElement !== element) {
      return;
    }

    // Use a microtask to allow for button clicks that might cancel
    // This also handles the race condition better than setTimeout
    queueMicrotask(() => {
      // Check if still in editing state (might have been cancelled by escape key)
      const state = ctx.getTextEditState();
      if (state.isEditing && state.element === element) {
        commitEdit(element, ctx);
      }
    });
  },
};

function commitEdit(element: HTMLElement, ctx: BehaviorContext): void {
  const newText = element.textContent ?? '';

  // Clean up contentEditable
  element.contentEditable = 'false';
  delete element.dataset.alaraEditing;

  // Commit to server
  ctx.commitTextEdit(newText);
}

function cancelEdit(element: HTMLElement, ctx: BehaviorContext): void {
  const { originalText } = ctx.getTextEditState();

  // Restore original text
  element.textContent = originalText;

  // Clean up contentEditable
  element.contentEditable = 'false';
  delete element.dataset.alaraEditing;

  // Cancel editing state
  ctx.cancelTextEditing();
}

// Self-register with the registry
editorBehaviorsRegistry.register(textEditBehavior);

export { textEditBehavior };
