import { createStore } from 'zustand/vanilla';
import type { ElementTarget } from '@alara/core/shared';

// ============================================================================
// Types
// ============================================================================

export interface SelectedElement {
  /** The DOM element that is selected */
  element: HTMLElement;
  /** Parsed target information from oid/css attributes */
  target: ElementTarget | null;
  /** Bounding rect at time of selection */
  bounds: DOMRect;
}

export interface HoveredElement {
  /** The DOM element that is hovered */
  element: HTMLElement;
  /** Bounding rect at time of hover */
  bounds: DOMRect;
}

export interface TextEditState {
  /** Whether text editing is active */
  isEditing: boolean;
  /** The element being edited */
  element: HTMLElement | null;
  /** Original text before editing (for cancel/undo) */
  originalText: string;
  /** The oid of the element being edited */
  oid: string;
}

export interface PendingEdit {
  /** Unique ID for the edit request */
  id: string;
  /** Type of transform */
  type: string;
  /** Target element info */
  target: ElementTarget;
  /** Timestamp when edit was initiated */
  timestamp: number;
  /** Current status */
  status: 'pending' | 'committed' | 'failed';
  /** Error message if failed */
  error?: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ============================================================================
// Store State
// ============================================================================

export interface EditorState {
  // WebSocket connection
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  wsClient: WebSocket | null;

  // Selection state
  selectedElement: SelectedElement | null;
  hoveredElement: HoveredElement | null;

  // Text editing state
  textEdit: TextEditState;

  // Pending edits tracking
  pendingEdits: Map<string, PendingEdit>;
}

// ============================================================================
// Store Actions
// ============================================================================

export interface EditorActions {
  // WebSocket actions
  setWebSocket: (ws: WebSocket | null) => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;

  // Selection actions
  selectElement: (element: HTMLElement, target: ElementTarget | null) => void;
  clearSelection: () => void;
  hoverElement: (element: HTMLElement) => void;
  clearHover: () => void;
  refreshBounds: () => void;

  // Text editing actions
  startTextEditing: (element: HTMLElement, originalText: string, oid: string) => void;
  commitTextEdit: (newText: string) => void;
  cancelTextEditing: () => void;
  getTextEditState: () => TextEditState;

  // Pending edits actions
  addPendingEdit: (edit: PendingEdit) => void;
  markEditCommitted: (id: string) => void;
  markEditFailed: (id: string, error: string) => void;
  removePendingEdit: (id: string) => void;

  // Utility
  sendMessage: (message: object) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

const initialTextEditState: TextEditState = {
  isEditing: false,
  element: null,
  originalText: '',
  oid: '',
};

export type EditorStore = ReturnType<typeof createEditorStore>;

export function createEditorStore() {
  return createStore<EditorState & EditorActions>((set, get) => ({
    // Initial state
    connectionStatus: 'disconnected',
    connectionError: null,
    wsClient: null,
    selectedElement: null,
    hoveredElement: null,
    textEdit: initialTextEditState,
    pendingEdits: new Map(),

    // WebSocket actions
    setWebSocket: (ws: WebSocket | null) => {
      set({ wsClient: ws });
    },

    setConnectionStatus: (status: ConnectionStatus, error?: string) => {
      set({
        connectionStatus: status,
        connectionError: error ?? null,
      });
    },

    // Selection actions
    selectElement: (element: HTMLElement, target: ElementTarget | null) => {
      const bounds = element.getBoundingClientRect();
      const currentTextEdit = get().textEdit;
      set({
        selectedElement: { element, target, bounds },
        // Clear text edit if selecting a different element
        textEdit: currentTextEdit.element !== element ? initialTextEditState : currentTextEdit,
      });
    },

    clearSelection: () => {
      set({
        selectedElement: null,
        textEdit: initialTextEditState,
      });
    },

    hoverElement: (element: HTMLElement) => {
      const bounds = element.getBoundingClientRect();
      set({ hoveredElement: { element, bounds } });
    },

    clearHover: () => {
      set({ hoveredElement: null });
    },

    refreshBounds: () => {
      const { selectedElement, hoveredElement } = get();
      const updates: Partial<EditorState> = {};

      if (selectedElement) {
        updates.selectedElement = {
          ...selectedElement,
          bounds: selectedElement.element.getBoundingClientRect(),
        };
      }

      if (hoveredElement) {
        updates.hoveredElement = {
          ...hoveredElement,
          bounds: hoveredElement.element.getBoundingClientRect(),
        };
      }

      if (Object.keys(updates).length > 0) {
        set(updates);
      }
    },

    // Text editing actions
    startTextEditing: (element: HTMLElement, originalText: string, oid: string) => {
      set({
        textEdit: {
          isEditing: true,
          element,
          originalText,
          oid,
        },
      });
    },

    commitTextEdit: (newText: string) => {
      const { textEdit, selectedElement, wsClient, addPendingEdit } = get();

      if (!textEdit.isEditing || !textEdit.element || !selectedElement?.target) {
        set({ textEdit: initialTextEditState });
        return;
      }

      // Only send if text changed
      if (newText !== textEdit.originalText) {
        // Create a pending edit
        const editId = `text-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const pendingEdit: PendingEdit = {
          id: editId,
          type: 'text-update',
          target: selectedElement.target,
          timestamp: Date.now(),
          status: 'pending',
        };

        addPendingEdit(pendingEdit);

        // Send transform request to server
        if (wsClient?.readyState === WebSocket.OPEN) {
          wsClient.send(
            JSON.stringify({
              action: 'transform',
              id: editId,
              type: 'text-update',
              target: selectedElement.target,
              change: {
                originalText: textEdit.originalText,
                newText,
              },
            })
          );
        }
      }

      // Reset text edit state
      set({ textEdit: initialTextEditState });
    },

    cancelTextEditing: () => {
      const { textEdit } = get();

      if (textEdit.isEditing && textEdit.element) {
        // Restore original text
        textEdit.element.textContent = textEdit.originalText;
      }

      set({ textEdit: initialTextEditState });
    },

    getTextEditState: () => {
      return get().textEdit;
    },

    // Pending edits actions
    addPendingEdit: (edit: PendingEdit) => {
      const pendingEdits = new Map(get().pendingEdits);
      pendingEdits.set(edit.id, edit);
      set({ pendingEdits });
    },

    markEditCommitted: (id: string) => {
      const pendingEdits = new Map(get().pendingEdits);
      const edit = pendingEdits.get(id);
      if (edit) {
        pendingEdits.set(id, { ...edit, status: 'committed' });
        // Remove committed edits after a short delay
        setTimeout(() => {
          get().removePendingEdit(id);
        }, 1000);
      }
      set({ pendingEdits });
    },

    markEditFailed: (id: string, error: string) => {
      const pendingEdits = new Map(get().pendingEdits);
      const edit = pendingEdits.get(id);
      if (edit) {
        pendingEdits.set(id, { ...edit, status: 'failed', error });
      }
      set({ pendingEdits });
    },

    removePendingEdit: (id: string) => {
      const pendingEdits = new Map(get().pendingEdits);
      pendingEdits.delete(id);
      set({ pendingEdits });
    },

    // Utility
    sendMessage: (message: object) => {
      const { wsClient } = get();
      if (wsClient?.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify(message));
      }
    },
  }));
}
