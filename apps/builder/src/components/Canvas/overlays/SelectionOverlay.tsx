import { useEffect, useState, useRef } from 'react';
import { useEditorStore, selectSelectedElement, selectHoveredElement } from '../../../store/editorStore';
import styles from './SelectionOverlay.module.css';

interface OverlayBounds {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getOverlayBounds(element: HTMLElement): OverlayBounds {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + window.scrollY,
    left: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  };
}

function getTagName(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();

  // For custom components (PascalCase), try to get a more meaningful name
  if (element.dataset.component) {
    return element.dataset.component;
  }

  return tagName;
}

export function SelectionOverlay() {
  const selectedElement = useEditorStore(selectSelectedElement);
  const hoveredElement = useEditorStore(selectHoveredElement);
  const [selectionBounds, setSelectionBounds] = useState<OverlayBounds | null>(null);
  const [hoverBounds, setHoverBounds] = useState<OverlayBounds | null>(null);
  const rafRef = useRef<number>();

  // Update selection bounds on resize/scroll
  useEffect(() => {
    if (!selectedElement) {
      setSelectionBounds(null);
      return;
    }

    const updateBounds = () => {
      setSelectionBounds(getOverlayBounds(selectedElement.element));
    };

    updateBounds();

    // Update on scroll and resize
    const handleUpdate = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(updateBounds);
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    // Use ResizeObserver to detect element size changes
    const resizeObserver = new ResizeObserver(handleUpdate);
    resizeObserver.observe(selectedElement.element);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
      resizeObserver.disconnect();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [selectedElement]);

  // Update hover bounds
  useEffect(() => {
    if (!hoveredElement) {
      setHoverBounds(null);
      return;
    }

    // Don't show hover if it's the same as selection
    if (selectedElement && hoveredElement.element === selectedElement.element) {
      setHoverBounds(null);
      return;
    }

    setHoverBounds(getOverlayBounds(hoveredElement.element));
  }, [hoveredElement, selectedElement]);

  return (
    <>
      {/* Hover overlay */}
      {hoverBounds && (
        <div
          className={styles.hoverOverlay}
          style={{
            top: hoverBounds.top,
            left: hoverBounds.left,
            width: hoverBounds.width,
            height: hoverBounds.height,
          }}
        />
      )}

      {/* Selection overlay */}
      {selectionBounds && selectedElement && (
        <div
          className={styles.selectionOverlay}
          style={{
            top: selectionBounds.top,
            left: selectionBounds.left,
            width: selectionBounds.width,
            height: selectionBounds.height,
          }}
        >
          {/* Tag label */}
          <div className={styles.tagLabel}>
            {getTagName(selectedElement.element)}
          </div>
        </div>
      )}
    </>
  );
}
