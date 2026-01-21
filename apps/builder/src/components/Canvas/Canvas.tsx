import { useEffect, useCallback, type ReactNode } from 'react';
import { useEditorStore } from '../../store/editorStore';
import { parseOid } from '@alara/core/shared';
import { SelectionOverlay } from './overlays/SelectionOverlay';
import styles from './Canvas.module.css';

interface CanvasProps {
  children: ReactNode;
}

/**
 * Canvas component that wraps the user's app and handles event delegation
 * for element selection and editing.
 */
export function Canvas({ children }: CanvasProps) {
  const selectElement = useEditorStore((state) => state.selectElement);
  const clearSelection = useEditorStore((state) => state.clearSelection);
  const hoverElement = useEditorStore((state) => state.hoverElement);
  const clearHover = useEditorStore((state) => state.clearHover);
  const startTextEditing = useEditorStore((state) => state.startTextEditing);
  const textEdit = useEditorStore((state) => state.textEdit);

  // Find the closest element with an oid attribute
  const findEditableElement = useCallback((target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest('[oid]') as HTMLElement | null;
  }, []);

  // Parse element target from oid attribute
  const parseElementTarget = useCallback((element: HTMLElement) => {
    const oid = element.getAttribute('oid');
    if (!oid) return null;

    const parsed = parseOid(oid);
    if (!parsed) return null;

    // For now, we don't have css attribute parsing in text editing
    // We'll add full ElementTarget support when implementing CSS editing
    return {
      file: parsed.file,
      lineNumber: parsed.lineNumber,
      column: parsed.column,
      cssFile: '',
      selectors: [],
    };
  }, []);

  // Handle click for selection
  const handleClick = useCallback(
    (e: MouseEvent) => {
      // Don't handle if clicking on overlay elements
      if ((e.target as HTMLElement).closest('[data-alara-overlay]')) {
        return;
      }

      const element = findEditableElement(e.target);

      if (element) {
        e.preventDefault();
        e.stopPropagation();

        const target = parseElementTarget(element);
        selectElement(element, target);
      } else {
        // Clicked outside any editable element
        clearSelection();
      }
    },
    [findEditableElement, parseElementTarget, selectElement, clearSelection]
  );

  // Handle double-click for text editing
  const handleDoubleClick = useCallback(
    (e: MouseEvent) => {
      const element = findEditableElement(e.target);

      if (!element) return;

      // Check if element is text-editable
      const tagName = element.tagName.toLowerCase();
      const textEditableTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'a', 'li', 'td', 'th'];

      if (!textEditableTags.includes(tagName)) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const oid = element.getAttribute('oid') ?? '';
      const originalText = element.textContent ?? '';

      // Make element editable
      element.contentEditable = 'true';
      element.focus();

      // Select all text
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);

      startTextEditing(element, originalText, oid);
    },
    [findEditableElement, startTextEditing]
  );

  // Handle mousemove for hover
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      // Don't hover if text editing is active
      if (textEdit.isEditing) {
        return;
      }

      const element = findEditableElement(e.target);

      if (element) {
        hoverElement(element);
      } else {
        clearHover();
      }
    },
    [findEditableElement, hoverElement, clearHover, textEdit.isEditing]
  );

  // Handle mouseleave for clearing hover
  const handleMouseLeave = useCallback(() => {
    clearHover();
  }, [clearHover]);

  // Handle keyboard events for text editing
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!textEdit.isEditing || !textEdit.element) return;

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const newText = textEdit.element.textContent ?? '';
        textEdit.element.contentEditable = 'false';
        useEditorStore.getState().commitTextEdit(newText);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        textEdit.element.contentEditable = 'false';
        useEditorStore.getState().cancelTextEditing();
      }
    },
    [textEdit.isEditing, textEdit.element]
  );

  // Handle blur for text editing commit
  const handleBlur = useCallback(
    (e: FocusEvent) => {
      if (!textEdit.isEditing || !textEdit.element) return;

      // Check if the blur target is the editing element
      if (e.target === textEdit.element) {
        const newText = textEdit.element.textContent ?? '';
        textEdit.element.contentEditable = 'false';
        useEditorStore.getState().commitTextEdit(newText);
      }
    },
    [textEdit.isEditing, textEdit.element]
  );

  // Set up event listeners
  useEffect(() => {
    document.addEventListener('click', handleClick, true);
    document.addEventListener('dblclick', handleDoubleClick, true);
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('mouseleave', handleMouseLeave, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('blur', handleBlur, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('dblclick', handleDoubleClick, true);
      document.removeEventListener('mousemove', handleMouseMove, true);
      document.removeEventListener('mouseleave', handleMouseLeave, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('blur', handleBlur, true);
    };
  }, [handleClick, handleDoubleClick, handleMouseMove, handleMouseLeave, handleKeyDown, handleBlur]);

  return (
    <div className={styles.canvas}>
      {children}
      <SelectionOverlay />
    </div>
  );
}
