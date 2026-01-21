import type { ElementTarget } from '@alara/core/shared';
import type { TextEditState } from '../store.js';

// ============================================================================
// Types
// ============================================================================

export interface BehaviorContext {
  /** Select an element */
  selectElement: (element: HTMLElement, target: ElementTarget | null) => void;
  /** Clear current selection */
  clearSelection: () => void;
  /** Start text editing mode */
  startTextEditing: (element: HTMLElement, originalText: string, oid: string) => void;
  /** Commit text edit */
  commitTextEdit: (newText: string) => void;
  /** Cancel text editing */
  cancelTextEditing: () => void;
  /** Get current text edit state */
  getTextEditState: () => TextEditState;
}

export interface EditorBehavior {
  /** Unique identifier for this behavior */
  id: string;

  /** Human-readable name */
  name: string;

  /**
   * Determine if this behavior applies to an element.
   * Return true if this behavior should handle the element.
   */
  appliesTo: (element: HTMLElement) => boolean;

  /**
   * Handle single click on element.
   * Default behavior is selection.
   */
  onClick?: (element: HTMLElement, event: MouseEvent, ctx: BehaviorContext) => void;

  /**
   * Handle double-click on element.
   * Common use: entering text edit mode, opening dialogs, etc.
   */
  onDoubleClick?: (element: HTMLElement, event: MouseEvent, ctx: BehaviorContext) => void;

  /**
   * Handle keydown while element is selected.
   */
  onKeyDown?: (element: HTMLElement, event: KeyboardEvent, ctx: BehaviorContext) => void;

  /**
   * Handle blur (focus lost) on the element.
   * Note: Use focusout event for better bubbling behavior.
   */
  onBlur?: (element: HTMLElement, event: FocusEvent, ctx: BehaviorContext) => void;

  /**
   * Priority for behavior matching (higher = checked first).
   * Default is 0.
   */
  priority?: number;
}

// ============================================================================
// Registry
// ============================================================================

class EditorBehaviorsRegistry {
  private behaviors: EditorBehavior[] = [];

  /**
   * Register a new behavior.
   * Behaviors are automatically sorted by priority (descending).
   */
  register(behavior: EditorBehavior): void {
    this.behaviors.push(behavior);
    // Sort by priority (higher priority first)
    this.behaviors.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Find behaviors that apply to an element.
   * Returns all matching behaviors in priority order.
   */
  getBehaviorsForElement(element: HTMLElement): EditorBehavior[] {
    return this.behaviors.filter((b) => b.appliesTo(element));
  }

  /**
   * Get the primary (highest priority) behavior for an element.
   */
  getPrimaryBehavior(element: HTMLElement): EditorBehavior | undefined {
    return this.behaviors.find((b) => b.appliesTo(element));
  }

  /**
   * Get all registered behaviors.
   */
  getAllBehaviors(): EditorBehavior[] {
    return [...this.behaviors];
  }

  /**
   * Get a behavior by ID.
   */
  getBehaviorById(id: string): EditorBehavior | undefined {
    return this.behaviors.find((b) => b.id === id);
  }
}

// Singleton instance
export const editorBehaviorsRegistry = new EditorBehaviorsRegistry();

// ============================================================================
// Helper to check if element is text-editable
// ============================================================================

export const TEXT_EDITABLE_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span', 'label', 'a',
  'li', 'td', 'th',
  'figcaption', 'caption',
  'blockquote', 'cite', 'q',
  'dt', 'dd',
];

export function isTextEditableElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  return TEXT_EDITABLE_TAGS.includes(tagName);
}
