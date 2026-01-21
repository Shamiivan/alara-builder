import { create } from 'zustand';
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

// ============================================================================
// Store State
// ============================================================================

interface EditorState {
  // WebSocket connection
  wsConnected: boolean;
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

interface EditorActions {
  // WebSocket actions
  connect: (url: string) => void;
  disconnect: () => void;
  setConnected: (connected: boolean) => void;

  // Selection actions
  selectElement: (element: HTMLElement, target: ElementTarget | null) => void;
  clearSelection: () => void;
  hoverElement: (element: HTMLElement) => void;
  clearHover: () => void;
  refreshSelectedElement: () => void;

  // Text editing actions
  startTextEditing: (element: HTMLElement, originalText: string, oid: string) => void;
  commitTextEdit: (newText: string) => void;
  cancelTextEditing: () => void;

  // Pending edits actions
  addPendingEdit: (edit: PendingEdit) => void;
  markEditCommitted: (id: string) => void;
  markEditFailed: (id: string, error: string) => void;
  clearPendingEditsForFile: (filePath: string) => void;
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

export const useEditorStore = create<EditorState & EditorActions>((set, get) => ({
  // Initial state
  wsConnected: false,
  wsClient: null,
  selectedElement: null,
  hoveredElement: null,
  textEdit: initialTextEditState,
  pendingEdits: new Map(),

  // WebSocket actions
  connect: (url: string) => {
    const { wsClient, setConnected } = get();

    if (wsClient?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[Editor] Connected to Alara server');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('[Editor] Disconnected from Alara server');
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('[Editor] WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleServerMessage(message, get, set);
      } catch (e) {
        console.error('[Editor] Failed to parse message:', e);
      }
    };

    set({ wsClient: ws });
  },

  disconnect: () => {
    const { wsClient } = get();
    if (wsClient) {
      wsClient.close();
      set({ wsClient: null, wsConnected: false });
    }
  },

  setConnected: (connected: boolean) => {
    set({ wsConnected: connected });
  },

  // Selection actions
  selectElement: (element: HTMLElement, target: ElementTarget | null) => {
    const bounds = element.getBoundingClientRect();
    set({
      selectedElement: { element, target, bounds },
      // Clear text edit if selecting a different element
      textEdit: get().textEdit.element !== element ? initialTextEditState : get().textEdit,
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

  refreshSelectedElement: () => {
    const { selectedElement } = get();
    if (selectedElement) {
      // Update bounds in case the element moved/resized
      const bounds = selectedElement.element.getBoundingClientRect();
      set({
        selectedElement: { ...selectedElement, bounds },
      });
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
      return;
    }

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

  clearPendingEditsForFile: (filePath: string) => {
    const pendingEdits = new Map(get().pendingEdits);
    for (const [id, edit] of pendingEdits) {
      if (edit.target.file === filePath || edit.target.cssFile === filePath) {
        pendingEdits.delete(id);
      }
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

// ============================================================================
// Server Message Handler
// ============================================================================

function handleServerMessage(
  message: { type: string; requestId?: string; success?: boolean; error?: { message: string } },
  get: () => EditorState & EditorActions,
  _set: (partial: Partial<EditorState>) => void
) {
  switch (message.type) {
    case 'connected':
      console.log('[Editor] Server acknowledged connection');
      break;

    case 'transform-result':
      if (message.requestId) {
        if (message.success) {
          get().markEditCommitted(message.requestId);
        } else {
          get().markEditFailed(message.requestId, message.error?.message ?? 'Unknown error');
        }
      }
      break;

    case 'pong':
      // Connection health check response
      break;

    default:
      console.log('[Editor] Unknown message type:', message.type);
  }
}

// ============================================================================
// Selectors
// ============================================================================

export const selectIsConnected = (state: EditorState) => state.wsConnected;
export const selectSelectedElement = (state: EditorState) => state.selectedElement;
export const selectHoveredElement = (state: EditorState) => state.hoveredElement;
export const selectIsTextEditing = (state: EditorState) => state.textEdit.isEditing;
export const selectTextEditState = (state: EditorState) => state.textEdit;
export const selectPendingEdits = (state: EditorState) => state.pendingEdits;
export const selectHasPendingEdits = (state: EditorState) => state.pendingEdits.size > 0;
