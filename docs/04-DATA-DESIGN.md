# 04 - Data Design

This document specifies data structures, state management patterns, AST representations, and caching strategies used throughout Alara Builder.

## Table of Contents

1. [State Architecture Overview](#1-state-architecture-overview)
2. [Editor Store (Zustand)](#2-editor-store-zustand)
3. [AST Cache Design](#3-ast-cache-design)
4. [CSS Data Structures](#4-css-data-structures)
5. [JSX Data Structures](#5-jsx-data-structures)
6. [Metadata Injection Format](#6-metadata-injection-format)
7. [Command History (Undo/Redo)](#7-command-history-undoredo)
8. [Zod Schemas (Runtime Validation)](#8-zod-schemas-runtime-validation)
9. [Data Flow Diagrams](#9-data-flow-diagrams)

---

## 1. State Architecture Overview

Alara uses a distributed state model with different stores optimized for their use cases:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Builder UI)                            │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         EditorStore (Zustand)                        │    │
│  │                                                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │    │
│  │  │  Selection   │  │   Pending    │  │    Undo/     │              │    │
│  │  │    State     │  │    Edits     │  │    Redo      │              │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │    │
│  │                                                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │    │
│  │  │  Connection  │  │   UI State   │  │    Cached    │              │    │
│  │  │    State     │  │   (panels)   │  │    Styles    │              │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────┬───────────────────────────────────────────┘
                                   │ WebSocket
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVER (Bun)                                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          CSSCache                                    │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────┐       │    │
│  │  │   CSS AST Cache (PostCSS Root)                           │       │    │
│  │  │                                                          │       │    │
│  │  │   Map<filePath, {                                        │       │    │
│  │  │     ast: Root,                                           │       │    │
│  │  │     mtime: number,                                       │       │    │
│  │  │     selectors: Map<selector, SelectorInfo>               │       │    │
│  │  │   }>                                                     │       │    │
│  │  │                                                          │       │    │
│  │  │   maxSize: 10 (simple limit, no LRU)                     │       │    │
│  │  └──────────────────────────────────────────────────────────┘       │    │
│  │                                                                      │    │
│  │  NOTE: JSX is NOT cached. Parsed on-demand (~5ms per file).         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       File System (Source of Truth)                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### State Ownership

| Data | Owner | Persistence | Sync |
|------|-------|-------------|------|
| Selected element | Browser (EditorStore) | Session | None |
| Pending edits | Browser (EditorStore) | Session | None |
| Undo/Redo stack | Browser (EditorStore) | Session | None |
| UI preferences | Browser (localStorage) | Persistent | None |
| CSS AST | Server (CSSCache) | Memory | Invalidate on file change |
| JSX AST | Not cached (parsed on demand) | N/A | N/A |
| Source files | File System | Persistent | Vite HMR |

---

## 2. Editor Store (Zustand)

Complete store structure with **slice composition** for modularity and extensibility.
Each slice is independent and can be added without modifying other slices.

> **Types**: Canonical type definitions (`EditorState`, `EditorActions`, `PendingEdit`, `Command`, etc.) are in [03-INTERFACES.md](./03-INTERFACES.md#5-store-interfaces). This section shows the **implementation pattern** using slices.

### 2.1 Store Slices (Composition Pattern)

The store uses **slice composition** - each feature is an independent slice that gets composed into the main store. To add new functionality, create a new slice file and add it to the composition.

```typescript
// apps/builder/src/store/index.ts
import { create } from 'zustand';
import { subscribeWithSelector, devtools } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────────
// SLICE IMPORTS - Each slice is independent
// ─────────────────────────────────────────────────────────────
import { createSelectionSlice, SelectionSlice } from './slices/selection';
import { createEditingSlice, EditingSlice } from './slices/editing';
import { createHistorySlice, HistorySlice } from './slices/history';
import { createConnectionSlice, ConnectionSlice } from './slices/connection';
import { createUISlice, UISlice } from './slices/ui';
import { createCacheSlice, CacheSlice } from './slices/cache';
// ─────────────────────────────────────────────────────────────
// TO ADD A NEW SLICE:
// 1. Create: apps/builder/src/store/slices/my-feature.ts
// 2. Import: import { createMyFeatureSlice, MyFeatureSlice } from './slices/my-feature';
// 3. Add to EditorStore type below
// 4. Add to create() composition below
// ─────────────────────────────────────────────────────────────

/**
 * EditorStore type - intersection of all slices.
 * Add new slice types here when extending.
 */
export type EditorStore =
  & SelectionSlice
  & EditingSlice
  & HistorySlice
  & ConnectionSlice
  & UISlice
  & CacheSlice;
  // & MyFeatureSlice;  // Add new slices here

/**
 * Main store - composed from independent slices.
 * Each slice can access other slices via get().
 */
export const useEditorStore = create<EditorStore>()(
  devtools(
    subscribeWithSelector((...args) => ({
      // Spread each slice's state and actions
      ...createSelectionSlice(...args),
      ...createEditingSlice(...args),
      ...createHistorySlice(...args),
      ...createConnectionSlice(...args),
      ...createUISlice(...args),
      ...createCacheSlice(...args),
      // ...createMyFeatureSlice(...args),  // Add new slices here
    })),
    { name: 'AlaraEditor' }
  )
);
```

### 2.2 Slice Template

Use this template when creating new slices:

```typescript
// apps/builder/src/store/slices/my-feature.ts
import { StateCreator } from 'zustand';
import type { EditorStore } from '../index';

// ─────────────────────────────────────────────────────────────
// STATE: Define what this slice stores
// ─────────────────────────────────────────────────────────────
export interface MyFeatureState {
  myValue: string;
  myItems: MyItem[];
}

// ─────────────────────────────────────────────────────────────
// ACTIONS: Define what this slice can do
// ─────────────────────────────────────────────────────────────
export interface MyFeatureActions {
  setMyValue: (value: string) => void;
  addItem: (item: MyItem) => void;
  removeItem: (id: string) => void;
}

// ─────────────────────────────────────────────────────────────
// SLICE TYPE: Combine state and actions
// ─────────────────────────────────────────────────────────────
export type MyFeatureSlice = MyFeatureState & MyFeatureActions;

// ─────────────────────────────────────────────────────────────
// SLICE CREATOR: Factory function for the slice
// ─────────────────────────────────────────────────────────────
export const createMyFeatureSlice: StateCreator<
  EditorStore,    // Full store type (for cross-slice access)
  [],             // Middleware types
  [],             // Middleware types
  MyFeatureSlice  // This slice's type
> = (set, get) => ({
  // Initial state
  myValue: '',
  myItems: [],

  // Actions
  setMyValue: (value) => set({ myValue: value }),

  addItem: (item) => set((state) => ({
    myItems: [...state.myItems, item],
  })),

  removeItem: (id) => set((state) => ({
    myItems: state.myItems.filter((item) => item.id !== id),
  })),
});
```

### 2.3 Selection Slice

```typescript
// store/slices/selection.ts
import { StateCreator } from 'zustand';

export interface SelectionState {
  selectedElement: SelectedElement | null;
  hoveredElement: HoveredElement | null;
  selectionPath: ElementTarget[];  // Breadcrumb path to selected element
}

export interface SelectionActions {
  selectElement: (element: HTMLElement, target: ElementTarget) => void;
  hoverElement: (target: ElementTarget, bounds: DOMRect) => void;
  clearHover: () => void;
  clearSelection: () => void;
  selectParent: () => void;
  selectByPath: (path: ElementTarget[]) => void;
}

export type SelectionSlice = SelectionState & SelectionActions;

export const createSelectionSlice: StateCreator<
  EditorStore,
  [],
  [],
  SelectionSlice
> = (set, get) => ({
  // State
  selectedElement: null,
  hoveredElement: null,
  selectionPath: [],

  // Actions
  selectElement: (domElement, target) => {
    const bounds = domElement.getBoundingClientRect();
    const computedStyles = window.getComputedStyle(domElement);

    // Build selection path (breadcrumb)
    const path = buildSelectionPath(domElement);

    set({
      selectedElement: {
        target,
        domElement,
        bounds,
        computedStyles,  // From browser's getComputedStyle() - no server fetch needed
      },
      selectionPath: path,
      hoveredElement: null,
    });
  },

  hoverElement: (target, bounds) => {
    if (get().isTextEditing) return;
    set({ hoveredElement: { target, bounds } });
  },

  clearHover: () => set({ hoveredElement: null }),

  clearSelection: () => set({
    selectedElement: null,
    selectionPath: [],
  }),

  selectParent: () => {
    const { selectionPath } = get();
    if (selectionPath.length > 1) {
      const parentPath = selectionPath.slice(0, -1);
      get().selectByPath(parentPath);
    }
  },

  selectByPath: (path) => {
    if (path.length === 0) return;
    const target = path[path.length - 1];
    // Construct oid from target fields: "file:line:col"
    const oid = `${target.file}:${target.lineNumber}:${target.column}`;
    const domElement = document.querySelector(
      `[oid="${oid}"]`
    ) as HTMLElement;

    if (domElement) {
      get().selectElement(domElement, target);
    }
  },
});
```

### 2.3 Editing Slice

```typescript
// store/slices/editing.ts
export interface EditingState {
  isTextEditing: boolean;
  textEditingTarget: ElementTarget | null;
  textEditingOriginal: string | null;
  textEditingCurrent: string | null;

  pendingEdits: Map<string, PendingEdit>;
}

export interface EditingActions {
  // Style editing
  updateStyle: (property: string, value: string) => void;
  addStyle: (property: string, value: string) => void;
  removeStyle: (property: string) => void;

  // Text editing
  startTextEditing: (target: ElementTarget, originalText: string) => void;
  updateTextContent: (content: string) => void;
  commitTextEdit: () => void;
  cancelTextEditing: () => void;

  // Variants
  createVariant: (name: string, styles: Record<string, string>) => void;
  applyVariant: (variantName: string) => void;
  removeVariant: (variantName: string) => void;

  // Pending edit management
  markEditCommitted: (editId: string) => void;
  markEditFailed: (editId: string, error: string) => void;
  clearPendingEdits: () => void;
}

export type EditingSlice = EditingState & EditingActions;

export const createEditingSlice: StateCreator<
  EditorStore,
  [],
  [],
  EditingSlice
> = (set, get) => ({
  // State
  isTextEditing: false,
  textEditingTarget: null,
  textEditingOriginal: null,
  textEditingCurrent: null,
  pendingEdits: new Map(),

  // Style editing
  updateStyle: (property, value) => {
    const { selectedElement, wsClient, pushCommand } = get();
    if (!selectedElement || !wsClient) return;

    const editId = crypto.randomUUID();
    const previousValue = selectedElement.computedStyles.getPropertyValue(property);

    // NOTE: No optimistic DOM update for MVP
    // Vite HMR will update the DOM when server writes the file
    // This simplifies rollback logic and avoids HMR/optimistic sync issues

    // 1. Record command for undo
    pushCommand({
      id: editId,
      type: 'update-style',
      target: selectedElement.target,
      before: { property, value: previousValue },
      after: { property, value },
      timestamp: Date.now(),
    });

    // 2. Track pending edit (show loading indicator in UI)
    set(state => ({
      pendingEdits: new Map(state.pendingEdits).set(editId, {
        id: editId,
        target: selectedElement.target,
        type: 'css-update',
        change: { property, value },
        status: 'pending',
        timestamp: Date.now(),
      }),
    }));

    // 3. Send to server - Vite HMR will update DOM when file is written
    wsClient.send(JSON.stringify({
      action: 'transform',
      id: editId,
      type: 'css-update',
      target: selectedElement.target,
      change: { property, value },
    }));
  },

  // Text editing
  startTextEditing: (target, originalText) => {
    set({
      isTextEditing: true,
      textEditingTarget: target,
      textEditingOriginal: originalText,
      textEditingCurrent: originalText,
    });
  },

  updateTextContent: (content) => {
    set({ textEditingCurrent: content });
  },

  commitTextEdit: () => {
    const {
      textEditingTarget,
      textEditingOriginal,
      textEditingCurrent,
      wsClient,
      pushCommand,
    } = get();

    if (!textEditingTarget || !wsClient) return;
    if (textEditingOriginal === textEditingCurrent) {
      // No change, just exit editing mode
      set({
        isTextEditing: false,
        textEditingTarget: null,
        textEditingOriginal: null,
        textEditingCurrent: null,
      });
      return;
    }

    const editId = crypto.randomUUID();

    // Record command
    pushCommand({
      id: editId,
      type: 'update-text',
      target: textEditingTarget,
      before: textEditingOriginal,
      after: textEditingCurrent,
      timestamp: Date.now(),
    });

    // Send to server
    wsClient.send(JSON.stringify({
      action: 'transform',
      id: editId,
      type: 'text-update',
      target: textEditingTarget,
      change: {
        originalText: textEditingOriginal,
        newText: textEditingCurrent,
      },
    }));

    // Exit editing mode
    set({
      isTextEditing: false,
      textEditingTarget: null,
      textEditingOriginal: null,
      textEditingCurrent: null,
    });
  },

  cancelTextEditing: () => {
    const { textEditingTarget, textEditingOriginal } = get();

    // Restore original text in DOM
    if (textEditingTarget && textEditingOriginal) {
      const oid = `${textEditingTarget.file}:${textEditingTarget.lineNumber}:${textEditingTarget.column}`;
      const element = document.querySelector(
        `[oid="${oid}"]`
      );
      if (element) {
        element.textContent = textEditingOriginal;
      }
    }

    set({
      isTextEditing: false,
      textEditingTarget: null,
      textEditingOriginal: null,
      textEditingCurrent: null,
    });
  },

  // Pending edit management
  markEditCommitted: (editId) => {
    set(state => {
      const newPending = new Map(state.pendingEdits);
      const edit = newPending.get(editId);
      if (edit) {
        edit.status = 'committed';
      }
      return { pendingEdits: newPending };
    });

    // Remove after delay (allows UI to show success state)
    setTimeout(() => {
      set(state => {
        const newPending = new Map(state.pendingEdits);
        newPending.delete(editId);
        return { pendingEdits: newPending };
      });
    }, 2000);
  },

  markEditFailed: (editId, error) => {
    const edit = get().pendingEdits.get(editId);

    if (edit) {
      // NOTE: No optimistic update to revert for MVP
      // Just log error and remove from pending
      console.error(`Edit failed: ${error}`, edit);
    }

    set(state => {
      const newPending = new Map(state.pendingEdits);
      newPending.delete(editId);
      return { pendingEdits: newPending };
    });
  },

  clearPendingEdits: () => set({ pendingEdits: new Map() }),

  // Variants (implementation similar to updateStyle)
  createVariant: (name, styles) => { /* ... */ },
  applyVariant: (variantName) => { /* ... */ },
  removeVariant: (variantName) => { /* ... */ },
});
```

### 2.4 History Slice (Undo/Redo)

```typescript
// store/slices/history.ts
export interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
  maxStackSize: number;
}

export interface HistoryActions {
  pushCommand: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  clearHistoryForFile: (file: string) => void;
}

export type HistorySlice = HistoryState & HistoryActions;

export const createHistorySlice: StateCreator<
  EditorStore,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  // State
  undoStack: [],
  redoStack: [],
  maxStackSize: 100,

  // Actions
  pushCommand: (command) => {
    set(state => ({
      undoStack: [...state.undoStack, command].slice(-state.maxStackSize),
      redoStack: [],  // Clear redo stack on new action
    }));
  },

  undo: () => {
    const { undoStack, wsClient } = get();
    if (undoStack.length === 0 || !wsClient) return;

    const command = undoStack[undoStack.length - 1];

    // Create reverse transform request and send to server
    const reverseRequest = createReverseRequest(command);
    wsClient.send(JSON.stringify(reverseRequest));

    // NOTE: No optimistic DOM update for MVP
    // Vite HMR will update DOM when server writes the file

    set(state => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, command].slice(-state.maxStackSize),
    }));
  },

  redo: () => {
    const { redoStack, wsClient } = get();
    if (redoStack.length === 0 || !wsClient) return;

    const command = redoStack[redoStack.length - 1];

    // Create forward transform request and send to server
    const forwardRequest = createForwardRequest(command);
    wsClient.send(JSON.stringify(forwardRequest));

    // NOTE: No optimistic DOM update for MVP
    // Vite HMR will update DOM when server writes the file

    set(state => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, command].slice(-state.maxStackSize),
    }));
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  clearHistory: () => set({ undoStack: [], redoStack: [] }),

  clearHistoryForFile: (file) => {
    set(state => ({
      undoStack: state.undoStack.filter(cmd => cmd.target.file !== file),
      redoStack: state.redoStack.filter(cmd => cmd.target.file !== file),
    }));
  },
});

// Helper functions
function createReverseRequest(command: Command): TransformRequest {
  switch (command.type) {
    case 'update-style':
      return {
        action: 'transform',
        id: crypto.randomUUID(),
        type: 'css-update',
        target: command.target,
        change: {
          property: (command.before as StyleChange).property,
          value: (command.before as StyleChange).value,
        },
      };
    case 'update-text':
      return {
        action: 'transform',
        id: crypto.randomUUID(),
        type: 'text-update',
        target: command.target,
        change: {
          originalText: command.after as string,
          newText: command.before as string,
        },
      };
    // ... other command types
  }
}
```

### 2.5 Connection Slice

```typescript
// store/slices/connection.ts
export interface ConnectionState {
  wsConnected: boolean;
  wsClient: WebSocket | null;
  serverVersion: string | null;
  projectDir: string | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

export interface ConnectionActions {
  connect: (url: string) => void;
  disconnect: () => void;
  handleMessage: (event: MessageEvent) => void;
}

export type ConnectionSlice = ConnectionState & ConnectionActions;

export const createConnectionSlice: StateCreator<
  EditorStore,
  [],
  [],
  ConnectionSlice
> = (set, get) => ({
  // State
  wsConnected: false,
  wsClient: null,
  serverVersion: null,
  projectDir: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,

  // Actions
  connect: (url) => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      set({
        wsConnected: true,
        wsClient: ws,
        reconnectAttempts: 0,
      });
    };

    ws.onclose = () => {
      set({ wsConnected: false, wsClient: null });

      // Auto-reconnect with backoff
      const { reconnectAttempts, maxReconnectAttempts } = get();
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        setTimeout(() => {
          set(s => ({ reconnectAttempts: s.reconnectAttempts + 1 }));
          get().connect(url);
        }, delay);
      }
    };

    ws.onmessage = (event) => get().handleMessage(event);
    ws.onerror = (error) => console.error('[Alara] WebSocket error:', error);

    set({ wsClient: ws });
  },

  disconnect: () => {
    get().wsClient?.close();
    set({
      wsConnected: false,
      wsClient: null,
      reconnectAttempts: get().maxReconnectAttempts, // Prevent auto-reconnect
    });
  },

  handleMessage: (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case 'connected':
        set({
          serverVersion: message.serverVersion,
          projectDir: message.projectDir,
        });
        break;

      case 'transform-result':
        if (message.success) {
          get().markEditCommitted(message.requestId);
        } else {
          get().markEditFailed(message.requestId, message.error?.message);
        }
        break;

      case 'variants':
        get().cacheVariants(message.cssFile, message.variants);
        break;

      // NOTE: External changes are NOT received via WebSocket.
      // They are detected via Vite HMR in useViteHMR hook.
      // See 03-INTERFACES.md "External Change Detection" section.

      case 'error':
        console.error('[Alara] Server error:', message.error);
        break;
    }
  },
});
```

### 2.6 UI Slice

```typescript
// store/slices/ui.ts
type ToolboxTabId = 'layout' | 'spacing' | 'colors' | 'typography' | 'border' | 'effects' | 'format';

export interface UIState {
  deviceMode: 'desktop' | 'tablet' | 'mobile';
  zoom: number;
  previewMode: boolean;
  activeToolboxTab: ToolboxTabId | null;  // Which tab is active in FloatingToolbox
  toasts: Toast[];
}

export interface UIActions {
  setDeviceMode: (mode: DeviceMode) => void;
  setZoom: (zoom: number) => void;
  togglePreviewMode: () => void;
  setActiveToolboxTab: (tab: ToolboxTabId | null) => void;
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
}

export type UISlice = UIState & UIActions;

// Default tab when element is selected
const DEFAULT_TAB: ToolboxTabId = 'spacing';

export const createUISlice: StateCreator<
  EditorStore,
  [],
  [],
  UISlice
> = (set, get) => ({
  // State
  deviceMode: 'desktop',
  zoom: 100,
  previewMode: false,
  activeToolboxTab: DEFAULT_TAB,
  toasts: [],

  // Actions
  setDeviceMode: (mode) => set({ deviceMode: mode }),

  setZoom: (zoom) => set({ zoom: Math.max(25, Math.min(200, zoom)) }),

  togglePreviewMode: () => set(s => ({ previewMode: !s.previewMode })),

  setActiveToolboxTab: (tab) => set({ activeToolboxTab: tab }),

  showToast: (toast) => {
    const id = crypto.randomUUID();
    const newToast = { ...toast, id };

    set(state => ({ toasts: [...state.toasts, newToast] }));

    if (toast.duration !== 0) {
      setTimeout(() => {
        get().dismissToast(id);
      }, toast.duration ?? 5000);
    }
  },

  dismissToast: (id) => {
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id),
    }));
  },
});

// LocalStorage helpers
function loadSections(): Set<string> | null {
  try {
    const saved = localStorage.getItem('alara:panelSections');
    return saved ? new Set(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

function saveSections(sections: Set<string>): void {
  localStorage.setItem('alara:panelSections', JSON.stringify([...sections]));
}
```

### 2.7 Cache Slice

```typescript
// store/slices/cache.ts
// NOTE: Element styles are NOT cached server-side.
// Computed styles come from browser's getComputedStyle() - always fresh.
// We only cache variants since those are fetched from CSS files on server.

export interface CacheState {
  /** Cached variants per CSS file */
  componentVariants: Map<string, VariantInfo[]>;
}

export interface CacheActions {
  fetchVariants: (cssFile: string) => void;
  cacheVariants: (cssFile: string, variants: VariantInfo[]) => void;
  invalidateVariantsCache: (file: string) => void;
  // NOTE: handleExternalChange removed - external changes detected via Vite HMR
  // See clearPendingEditsForFile, clearUndoRedoForFile, refreshSelectedElement
}

export type CacheSlice = CacheState & CacheActions;

export const createCacheSlice: StateCreator<
  EditorStore,
  [],
  [],
  CacheSlice
> = (set, get) => ({
  // State
  componentVariants: new Map(),

  // Actions
  fetchVariants: (cssFile) => {
    const { wsClient, componentVariants } = get();

    if (componentVariants.has(cssFile)) return;
    if (!wsClient) return;

    wsClient.send(JSON.stringify({
      action: 'get-variants',
      id: crypto.randomUUID(),
      cssFile,
    }));
  },

  cacheVariants: (cssFile, variants) => {
    set(state => ({
      componentVariants: new Map(state.componentVariants).set(cssFile, variants),
    }));
  },

  invalidateVariantsCache: (file) => {
    set(state => {
      const newVariants = new Map(state.componentVariants);
      newVariants.delete(file);
      return { componentVariants: newVariants };
    });
  },

  // Called by useViteHMR hook when Vite detects file changes
  // NOT called via WebSocket - see 03-INTERFACES.md "External Change Detection"
  clearPendingEditsForFile: (file: string) => {
    set(state => {
      const newPending = new Map(state.pendingEdits);
      for (const [id, edit] of newPending) {
        if (edit.target.file === file) {
          newPending.delete(id);
        }
      }
      return { pendingEdits: newPending };
    });
  },

  clearUndoRedoForFile: (file: string) => {
    const { clearHistoryForFile, invalidateVariantsCache } = get();
    invalidateVariantsCache(file);
    clearHistoryForFile(file);
  },

  refreshSelectedElement: () => {
    // No server fetch needed - computed styles are always fresh from browser
    // Just trigger a re-render by updating bounds
    const { selectedElement } = get();
    if (selectedElement?.domElement) {
      set({
        selectedElement: {
          ...selectedElement,
          bounds: selectedElement.domElement.getBoundingClientRect(),
          computedStyles: window.getComputedStyle(selectedElement.domElement),
        },
      });
    }
  },
});
```

---

## 3. AST Cache Design

**Simplified Design**: Cache only CSS files. JSX parsing is fast (~5ms) and doesn't need caching.
This eliminates dependency tracking between CSS and JSX files.

### 3.1 Cache Structure

```typescript
// engine/cache/CSSCache.ts

interface CSSCacheEntry {
  ast: postcss.Root;
  mtime: number;          // File modification time
  selectors: Map<string, SelectorInfo>;  // Index for fast lookup
}

interface SelectorInfo {
  lineNumber: number;
  rule: postcss.Rule;
  properties: Map<string, postcss.Declaration>;
}

export class CSSCache {
  private cache: Map<string, CSSCacheEntry> = new Map();
  private maxSize = 10;  // Simple limit, no complex LRU

  get(filePath: string): postcss.Root | null {
    return this.cache.get(filePath)?.ast ?? null;
  }

  async set(filePath: string, ast: postcss.Root): Promise<void> {
    const stat = await Bun.file(filePath).stat();

    // Build selector index for fast lookups
    const selectors = new Map<string, SelectorInfo>();
    ast.walkRules(rule => {
      const line = rule.source?.start?.line ?? 0;
      const props = new Map<string, postcss.Declaration>();
      rule.walkDecls(decl => props.set(decl.prop, decl));

      selectors.set(rule.selector, {
        lineNumber: line,
        rule,
        properties: props,
      });
    });

    // Simple eviction: remove oldest if at limit
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(filePath, {
      ast,
      mtime: stat.mtime.getTime(),
      selectors,
    });
  }

  getSelector(filePath: string, selector: string): SelectorInfo | null {
    return this.cache.get(filePath)?.selectors.get(selector) ?? null;
  }

  invalidate(filePath: string): void {
    this.cache.delete(filePath);
  }

  async isStale(filePath: string): Promise<boolean> {
    const entry = this.cache.get(filePath);
    if (!entry) return true;

    try {
      const stat = await Bun.file(filePath).stat();
      return stat.mtime.getTime() > entry.mtime;
    } catch {
      return true;
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
```

> **Why no JSX caching?**
> - JSX parsing with ts-morph is fast (~5ms per file)
> - CSS parsing with postcss is slower (~20ms per file)
> - Caching JSX requires tracking CSS imports for invalidation
> - Simpler architecture: cache only what's slow to parse

### 3.2 Cache Invalidation Strategy

```
File Change Detected (via Vite HMR)
         │
         ▼
┌────────────────────┐
│ Vite HMR updates   │
│ DOM automatically  │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│ On next request:   │
│ Check cache mtime  │
│ Invalidate if stale│
└────────────────────┘
```

> **Note**: Cache invalidation is lazy (on next request), not proactive.
> This simplifies the architecture - no FileWatcher needed for cache.

---

## 4. CSS Data Structures

Representations for CSS Module data. We use a **typed CSS value system** inspired by Webstudio's approach, enabling bidirectional conversion between structured data and CSS strings.

### 4.1 Typed CSS Value System

All CSS values are represented as discriminated unions with Zod schemas. This enables:
- **Validation** before writing to files
- **Smart UI controls** that work with structured data
- **Unit conversion** and math operations
- **Semantic comparison** for conflict detection
- **Structured undo/redo** with meaningful diffs

```typescript
// schemas/css-values.ts
import { z } from 'zod';

// ============================================
// CSS Units
// ============================================

export const CSSUnitSchema = z.enum([
  'px', 'rem', 'em', '%', 'vh', 'vw', 'vmin', 'vmax',
  'ch', 'ex', 'cap', 'ic', 'lh', 'rlh',
  'svw', 'svh', 'lvw', 'lvh', 'dvw', 'dvh',
  'cqw', 'cqh', 'cqi', 'cqb', 'cqmin', 'cqmax',
  'deg', 'rad', 'turn', 'grad',
  's', 'ms',
  'fr',
]);

export type CSSUnit = z.infer<typeof CSSUnitSchema>;

// ============================================
// Primitive Value Types
// ============================================

/**
 * Numeric value with unit (e.g., 16px, 1.5rem, 50%)
 */
export const UnitValueSchema = z.object({
  type: z.literal('unit'),
  value: z.number(),
  unit: CSSUnitSchema,
});
export type UnitValue = z.infer<typeof UnitValueSchema>;

/**
 * Unitless number (e.g., line-height: 1.5, opacity: 0.5)
 */
export const NumberValueSchema = z.object({
  type: z.literal('number'),
  value: z.number(),
});
export type NumberValue = z.infer<typeof NumberValueSchema>;

/**
 * CSS keyword (e.g., auto, none, inherit, flex)
 */
export const KeywordValueSchema = z.object({
  type: z.literal('keyword'),
  value: z.string(),
});
export type KeywordValue = z.infer<typeof KeywordValueSchema>;

/**
 * String value (e.g., font-family names, content)
 */
export const StringValueSchema = z.object({
  type: z.literal('string'),
  value: z.string(),
  quote: z.enum(['"', "'"]).default('"'),
});
export type StringValue = z.infer<typeof StringValueSchema>;

// ============================================
// Color Values
// ============================================

export const ColorSpaceSchema = z.enum([
  'srgb', 'srgb-linear', 'display-p3', 'a98-rgb', 'prophoto-rgb',
  'rec2020', 'xyz', 'xyz-d50', 'xyz-d65',
  'hsl', 'hwb', 'lab', 'lch', 'oklab', 'oklch',
]);

/**
 * Color value with full color space support
 */
export const ColorValueSchema = z.object({
  type: z.literal('color'),
  colorSpace: ColorSpaceSchema,
  channels: z.tuple([z.number(), z.number(), z.number()]),
  alpha: z.number().min(0).max(1),
});
export type ColorValue = z.infer<typeof ColorValueSchema>;

/**
 * Legacy RGB color (for backwards compatibility)
 */
export const RgbValueSchema = z.object({
  type: z.literal('rgb'),
  r: z.number().min(0).max(255),
  g: z.number().min(0).max(255),
  b: z.number().min(0).max(255),
  alpha: z.number().min(0).max(1).default(1),
});
export type RgbValue = z.infer<typeof RgbValueSchema>;

// ============================================
// CSS Variable Reference
// ============================================

/**
 * CSS variable reference: var(--name, fallback)
 */
export const VarValueSchema: z.ZodType<VarValue> = z.object({
  type: z.literal('var'),
  name: z.string().regex(/^[a-zA-Z_-][a-zA-Z0-9_-]*$/),
  fallback: z.lazy(() => StyleValueSchema).optional(),
});
export type VarValue = {
  type: 'var';
  name: string;
  fallback?: StyleValue;
};

// ============================================
// Complex Value Types
// ============================================

/**
 * CSS function call: calc(), min(), max(), clamp(), etc.
 */
export const FunctionValueSchema: z.ZodType<FunctionValue> = z.object({
  type: z.literal('function'),
  name: z.string(),
  args: z.lazy(() => StyleValueSchema),
});
export type FunctionValue = {
  type: 'function';
  name: string;
  args: StyleValue;
};

/**
 * Tuple of values (e.g., background-position: 50% 100%)
 */
export const TupleValueSchema: z.ZodType<TupleValue> = z.object({
  type: z.literal('tuple'),
  value: z.array(z.lazy(() => StyleValueSchema)),
});
export type TupleValue = {
  type: 'tuple';
  value: StyleValue[];
};

/**
 * Comma-separated layers (e.g., multiple backgrounds, shadows)
 */
export const LayersValueSchema: z.ZodType<LayersValue> = z.object({
  type: z.literal('layers'),
  value: z.array(z.lazy(() => StyleValueSchema)),
});
export type LayersValue = {
  type: 'layers';
  value: StyleValue[];
};

/**
 * Box shadow value with structured properties
 */
export const ShadowValueSchema = z.object({
  type: z.literal('shadow'),
  inset: z.boolean().default(false),
  offsetX: z.lazy(() => StyleValueSchema),
  offsetY: z.lazy(() => StyleValueSchema),
  blur: z.lazy(() => StyleValueSchema).optional(),
  spread: z.lazy(() => StyleValueSchema).optional(),
  color: z.lazy(() => StyleValueSchema).optional(),
});
export type ShadowValue = z.infer<typeof ShadowValueSchema>;

/**
 * URL/Image value
 */
export const ImageValueSchema = z.object({
  type: z.literal('image'),
  url: z.string(),
});
export type ImageValue = z.infer<typeof ImageValueSchema>;

/**
 * Font family value (array of family names)
 */
export const FontFamilyValueSchema = z.object({
  type: z.literal('fontFamily'),
  value: z.array(z.string()),
});
export type FontFamilyValue = z.infer<typeof FontFamilyValueSchema>;

/**
 * Unparsed value - fallback for complex values we don't fully parse
 */
export const UnparsedValueSchema = z.object({
  type: z.literal('unparsed'),
  value: z.string(),
});
export type UnparsedValue = z.infer<typeof UnparsedValueSchema>;

/**
 * Invalid value - for showing validation errors
 */
export const InvalidValueSchema = z.object({
  type: z.literal('invalid'),
  value: z.string(),
  error: z.string().optional(),
});
export type InvalidValue = z.infer<typeof InvalidValueSchema>;

// ============================================
// Union of All Style Values
// ============================================

export const StyleValueSchema: z.ZodType<StyleValue> = z.discriminatedUnion('type', [
  UnitValueSchema,
  NumberValueSchema,
  KeywordValueSchema,
  StringValueSchema,
  ColorValueSchema,
  RgbValueSchema,
  VarValueSchema as z.ZodType<VarValue>,
  FunctionValueSchema as z.ZodType<FunctionValue>,
  TupleValueSchema as z.ZodType<TupleValue>,
  LayersValueSchema as z.ZodType<LayersValue>,
  ShadowValueSchema,
  ImageValueSchema,
  FontFamilyValueSchema,
  UnparsedValueSchema,
  InvalidValueSchema,
]);

export type StyleValue =
  | UnitValue
  | NumberValue
  | KeywordValue
  | StringValue
  | ColorValue
  | RgbValue
  | VarValue
  | FunctionValue
  | TupleValue
  | LayersValue
  | ShadowValue
  | ImageValue
  | FontFamilyValue
  | UnparsedValue
  | InvalidValue;
```

### 4.2 CSS Value Parsing (String → Typed)

Parse CSS strings into typed values using `css-tree`:

```typescript
// engine/css/parse-value.ts
import { parse, lexer, generate } from 'css-tree';
import type { StyleValue, ColorValue, UnitValue, CSSUnit } from '@alara/core/shared';

const AVAILABLE_UNITS = new Set<CSSUnit>([
  'px', 'rem', 'em', '%', 'vh', 'vw', 'vmin', 'vmax', 'fr',
  'deg', 'rad', 'turn', 's', 'ms', 'ch', 'ex',
]);

/**
 * Parse a CSS value string into a typed StyleValue
 */
export function parseCssValue(property: string, input: string): StyleValue {
  const trimmed = input.trim();

  // CSS-wide keywords
  if (['initial', 'inherit', 'unset', 'revert'].includes(trimmed)) {
    return { type: 'keyword', value: trimmed };
  }

  // Empty or invalid
  if (trimmed.length === 0) {
    return { type: 'invalid', value: input, error: 'Empty value' };
  }

  // Try to parse with css-tree
  try {
    const ast = parse(trimmed, { context: 'value' });
    return parseAstNode(ast, property);
  } catch (error) {
    return { type: 'unparsed', value: trimmed };
  }
}

function parseAstNode(node: CssNode, property: string): StyleValue {
  if (node.type === 'Value' && node.children) {
    const children = node.children.toArray();

    // Single value
    if (children.length === 1) {
      return parseSingleNode(children[0], property);
    }

    // Check for comma-separated (layers)
    const hasComma = children.some(c => c.type === 'Operator' && c.value === ',');
    if (hasComma) {
      return parseLayersValue(children, property);
    }

    // Multiple space-separated values (tuple)
    return {
      type: 'tuple',
      value: children
        .filter(c => c.type !== 'WhiteSpace')
        .map(c => parseSingleNode(c, property)),
    };
  }

  return parseSingleNode(node, property);
}

function parseSingleNode(node: CssNode, property: string): StyleValue {
  // Number with unit
  if (node.type === 'Dimension') {
    if (AVAILABLE_UNITS.has(node.unit as CSSUnit)) {
      return {
        type: 'unit',
        value: parseFloat(node.value),
        unit: node.unit as CSSUnit,
      };
    }
  }

  // Percentage
  if (node.type === 'Percentage') {
    return {
      type: 'unit',
      value: parseFloat(node.value),
      unit: '%',
    };
  }

  // Plain number
  if (node.type === 'Number') {
    return {
      type: 'number',
      value: parseFloat(node.value),
    };
  }

  // Identifier (keyword)
  if (node.type === 'Identifier') {
    // Check if it's a color name
    const colorValue = parseColor(node.name);
    if (colorValue) return colorValue;

    return { type: 'keyword', value: node.name };
  }

  // Hash (hex color)
  if (node.type === 'Hash') {
    const colorValue = parseColor(`#${node.value}`);
    if (colorValue) return colorValue;
  }

  // Function
  if (node.type === 'Function') {
    return parseFunctionNode(node, property);
  }

  // URL
  if (node.type === 'Url') {
    return { type: 'image', url: node.value };
  }

  // String
  if (node.type === 'String') {
    return { type: 'string', value: node.value, quote: '"' };
  }

  // Fallback
  return { type: 'unparsed', value: generate(node) };
}

function parseFunctionNode(node: FunctionNode, property: string): StyleValue {
  const name = node.name.toLowerCase();
  const args = node.children.toArray();

  // var() function
  if (name === 'var') {
    const [nameNode, comma, ...fallbackNodes] = args;
    if (nameNode?.type === 'Identifier') {
      const varName = nameNode.name.replace(/^--/, '');
      const result: VarValue = { type: 'var', name: varName };

      if (fallbackNodes.length > 0) {
        const fallbackStr = generate({
          type: 'Value',
          children: new List().fromArray(fallbackNodes),
        }).trim();
        result.fallback = parseCssValue(property, fallbackStr);
      }

      return result;
    }
  }

  // Color functions
  if (['rgb', 'rgba', 'hsl', 'hsla', 'oklch', 'oklab', 'lab', 'lch', 'hwb', 'color'].includes(name)) {
    const colorValue = parseColor(generate(node));
    if (colorValue) return colorValue;
  }

  // calc(), min(), max(), clamp()
  if (['calc', 'min', 'max', 'clamp'].includes(name)) {
    return {
      type: 'function',
      name,
      args: { type: 'unparsed', value: generate({ type: 'Value', children: node.children }) },
    };
  }

  // Other functions
  return {
    type: 'function',
    name,
    args: parseAstNode({ type: 'Value', children: node.children }, property),
  };
}

/**
 * Parse color string using colorjs.io
 */
function parseColor(colorString: string): ColorValue | null {
  try {
    const color = new Color(colorString);
    return {
      type: 'color',
      colorSpace: mapColorSpace(color.spaceId),
      channels: color.coords.map(c => Math.round(c * 10000) / 10000) as [number, number, number],
      alpha: Math.round(color.alpha * 10000) / 10000,
    };
  } catch {
    return null;
  }
}
```

### 4.3 CSS Value Serialization (Typed → String)

Convert typed values back to CSS strings:

```typescript
// engine/css/to-value.ts
import type { StyleValue } from '@alara/core/shared';

/**
 * Convert a typed StyleValue back to a CSS string
 */
export function toValue(styleValue: StyleValue | undefined): string {
  if (!styleValue) return '';

  switch (styleValue.type) {
    case 'unit':
      return `${styleValue.value}${styleValue.unit}`;

    case 'number':
      return String(styleValue.value);

    case 'keyword':
      return styleValue.value;

    case 'string':
      return `${styleValue.quote}${styleValue.value}${styleValue.quote}`;

    case 'color':
      return colorToString(styleValue);

    case 'rgb':
      return `rgb(${styleValue.r} ${styleValue.g} ${styleValue.b} / ${styleValue.alpha})`;

    case 'var':
      const fallback = styleValue.fallback ? `, ${toValue(styleValue.fallback)}` : '';
      return `var(--${styleValue.name}${fallback})`;

    case 'function':
      return `${styleValue.name}(${toValue(styleValue.args)})`;

    case 'tuple':
      return styleValue.value.map(toValue).join(' ');

    case 'layers':
      return styleValue.value.map(toValue).join(', ');

    case 'shadow': {
      let shadow = `${toValue(styleValue.offsetX)} ${toValue(styleValue.offsetY)}`;
      if (styleValue.blur) shadow += ` ${toValue(styleValue.blur)}`;
      if (styleValue.spread) shadow += ` ${toValue(styleValue.spread)}`;
      if (styleValue.color) shadow += ` ${toValue(styleValue.color)}`;
      if (styleValue.inset) shadow = `inset ${shadow}`;
      return shadow;
    }

    case 'image':
      return `url(${JSON.stringify(styleValue.url)})`;

    case 'fontFamily':
      return styleValue.value
        .map(f => f.includes(' ') ? `"${f}"` : f)
        .join(', ');

    case 'unparsed':
    case 'invalid':
      return styleValue.value;

    default:
      styleValue satisfies never;
      return '';
  }
}

function colorToString(color: ColorValue): string {
  const [c1, c2, c3] = color.channels;
  const alpha = color.alpha;

  switch (color.colorSpace) {
    case 'srgb':
      return `rgb(${Math.round(c1 * 255)} ${Math.round(c2 * 255)} ${Math.round(c3 * 255)} / ${alpha})`;
    case 'hsl':
      return `hsl(${c1} ${c2}% ${c3}% / ${alpha})`;
    case 'hwb':
      return `hwb(${c1} ${c2}% ${c3}% / ${alpha})`;
    case 'oklch':
      return `oklch(${c1} ${c2} ${c3} / ${alpha})`;
    case 'oklab':
      return `oklab(${c1} ${c2} ${c3} / ${alpha})`;
    default:
      return `color(${color.colorSpace} ${c1} ${c2} ${c3} / ${alpha})`;
  }
}
```

### 4.4 Value Utilities

Helper functions for working with typed CSS values:

```typescript
// engine/css/value-utils.ts
import type { StyleValue, UnitValue, ColorValue } from '@alara/core/shared';

/**
 * Check if two StyleValues are semantically equal
 */
export function valuesEqual(a: StyleValue, b: StyleValue): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'unit':
      // Convert to common unit (px) for comparison
      const aPx = toPixels(a);
      const bPx = toPixels(b as UnitValue);
      return Math.abs(aPx - bPx) < 0.01;

    case 'color':
      // Compare in same color space
      const aColor = a as ColorValue;
      const bColor = b as ColorValue;
      return (
        aColor.colorSpace === bColor.colorSpace &&
        aColor.channels.every((c, i) => Math.abs(c - bColor.channels[i]) < 0.0001) &&
        Math.abs(aColor.alpha - bColor.alpha) < 0.0001
      );

    case 'var':
      return a.name === (b as typeof a).name;

    default:
      // Fallback to string comparison
      return toValue(a) === toValue(b);
  }
}

/**
 * Convert a unit value to pixels (for comparison)
 */
export function toPixels(value: UnitValue, baseFontSize = 16): number {
  switch (value.unit) {
    case 'px': return value.value;
    case 'rem': return value.value * baseFontSize;
    case 'em': return value.value * baseFontSize;
    case '%': return value.value; // Context-dependent
    default: return value.value;
  }
}

/**
 * Convert between units
 */
export function convertUnit(
  value: UnitValue,
  targetUnit: CSSUnit,
  baseFontSize = 16
): UnitValue {
  const px = toPixels(value, baseFontSize);

  let newValue: number;
  switch (targetUnit) {
    case 'px': newValue = px; break;
    case 'rem': newValue = px / baseFontSize; break;
    case 'em': newValue = px / baseFontSize; break;
    default: newValue = value.value;
  }

  return { type: 'unit', value: newValue, unit: targetUnit };
}

/**
 * Increment/decrement a unit value
 */
export function adjustValue(value: UnitValue, delta: number): UnitValue {
  return { ...value, value: value.value + delta };
}

/**
 * Create a UnitValue
 */
export function unit(value: number, unit: CSSUnit): UnitValue {
  return { type: 'unit', value, unit };
}

/**
 * Create a KeywordValue
 */
export function keyword(value: string): KeywordValue {
  return { type: 'keyword', value };
}

/**
 * Create a VarValue
 */
export function cssVar(name: string, fallback?: StyleValue): VarValue {
  return { type: 'var', name, fallback };
}
```

### 4.5 Parsed CSS Structure

```typescript
/**
 * Represents a CSS Module file after parsing.
 */
interface ParsedCSSModule {
  filePath: string;
  classes: Map<string, CSSClass>;
  variables: Map<string, CSSVariable>;
  imports: string[];  // @import statements
}

/**
 * A CSS class definition.
 */
interface CSSClass {
  name: string;           // 'button', 'large'
  selector: string;       // '.button', '.large'
  lineNumber: number;
  declarations: CSSDeclaration[];
  isVariant: boolean;     // true if this is a variant of base class
  baseClass?: string;     // If variant, the base class name
}

/**
 * A CSS property declaration.
 */
interface CSSDeclaration {
  property: string;       // 'padding'
  value: string;          // '16px 24px'
  lineNumber: number;
  isVariable: boolean;    // true if value contains var()
  variableRefs?: string[];  // ['--color-primary'] if isVariable
  important: boolean;
}

/**
 * A CSS custom property (variable).
 */
interface CSSVariable {
  name: string;           // '--color-primary'
  value: string;          // '#1a73e8'
  lineNumber: number;
  file: string;           // Where defined (could be variables.css)
}
```

### 4.2 Style Resolution

```typescript
/**
 * Resolved styles for an element, combining:
 * - Base class styles
 * - Active variant styles
 * - Inline styles (from DOM)
 */
interface ResolvedStyles {
  /** All declarations, in cascade order */
  declarations: ResolvedDeclaration[];

  /** Grouped by property for easy access */
  byProperty: Map<string, ResolvedDeclaration>;

  /** Active variants */
  variants: string[];

  /** Source information */
  source: {
    cssFile: string;
    baseSelector: string;
    variantSelectors: string[];
  };
}

interface ResolvedDeclaration {
  property: string;
  value: string;
  source: 'base' | 'variant' | 'inline';
  sourceSelector?: string;
  lineNumber?: number;

  /** Computed value (resolved variables, computed units) */
  computed: string;

  /** Original value before resolution */
  original: string;
}
```

---

## 5. JSX Data Structures

Representations for JSX/TSX file data.

### 5.1 Element Metadata

```typescript
/**
 * Metadata injected into DOM elements during development.
 */
interface ElementMetadata {
  /** Relative file path */
  file: string;           // 'src/components/Button/Button.tsx'

  /** Line number in source */
  line: number;           // 12

  /** CSS Module selector */
  selector: string;       // '.button'

  /** Content hash for re-matching */
  hash: string;           // 'a1b2c3d4'

  /** Component name if this is a component */
  component?: string;     // 'Button'
}

/**
 * Self-contained attributes on DOM elements.
 * All metadata encoded directly - no registry lookup needed.
 */
interface DOMElementAttributes {
  /** JSX source location: "src/components/Button.tsx:12:4" */
  oid: string;
  /** CSS Module location: "src/components/Button.module.css:.button .primary" */
  css: string;
}

/**
 * Parsed element target from DOM attributes.
 */
interface ElementTarget {
  file: string;           // TSX file path
  lineNumber: number;     // Line number (1-indexed)
  column: number;         // Column number (1-indexed)
  cssFile: string;        // CSS Module file path
  selectors: string[];    // CSS selectors (e.g., ['.button', '.primary'])
}
```

### 5.2 JSX Element Info

```typescript
/**
 * Information about a JSX element in source code.
 */
interface JSXElementSource {
  /** Element type */
  type: 'element' | 'self-closing' | 'fragment';

  /** Tag name or component name */
  tagName: string;        // 'button', 'Button', 'div'

  /** Is this a component (PascalCase) or HTML element */
  isComponent: boolean;

  /** Source location */
  location: {
    file: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
  };

  /** className attribute info */
  className: ClassNameInfo | null;

  /** Text content (for text editing) */
  textContent: string | null;

  /** Child elements */
  children: JSXElementSource[];
}

interface ClassNameInfo {
  /** Raw className value */
  raw: string;            // '{styles.button}' or '{`${styles.button} ${styles.large}`}'

  /** Parsed class references */
  classes: ClassReference[];

  /** Format of the className */
  format: 'simple' | 'template' | 'conditional';
}

interface ClassReference {
  /** Class name without styles. prefix */
  name: string;           // 'button', 'large'

  /** Full reference */
  fullRef: string;        // 'styles.button'

  /** Is this a variant? */
  isVariant: boolean;
}
```

---

## 6. Metadata Injection Format

How metadata is added to the DOM during development.

### 6.1 Vite Plugin Transform

```typescript
/**
 * Input JSX:
 */
<Button className={styles.button} onClick={handleClick}>
  Click me
</Button>

/**
 * Output JSX (after Vite plugin transform):
 */
<EditorWrapper
  file="src/pages/Home.tsx"
  line={15}
  col={3}
  css="src/pages/Home.module.css"
  selector=".button"
>
  <Button className={styles.button} onClick={handleClick}>
    Click me
  </Button>
</EditorWrapper>

/**
 * Rendered DOM:
 */
<div
  oid="Home-15-3"
  style="display: contents"
>
  <button class="Button_button__abc123">
    Click me
  </button>
</div>
```

### 6.2 Metadata Schema

```typescript
/**
 * Global registry of element metadata.
 * Accessible via window.__ALARA_METADATA__
 */
interface AlaraMetadataRegistry {
  version: string;

  /** Map of file paths to their elements */
  files: Map<string, FileMetadata>;

  /** Quick lookup by hash */
  byHash: Map<string, ElementMetadata>;
}

interface FileMetadata {
  path: string;
  elements: ElementMetadata[];
  cssModules: string[];  // Associated CSS Module files
}
```

---

## 7. Command History (Undo/Redo)

Data structures for the command pattern implementation.

### 7.1 Command Types

```typescript
/**
 * Base command interface.
 */
interface BaseCommand {
  id: string;
  type: CommandType;
  target: ElementTarget;
  timestamp: number;
}

/**
 * Style property change command.
 */
interface StyleCommand extends BaseCommand {
  type: 'update-style' | 'add-style' | 'remove-style';
  before: {
    property: string;
    value: string | null;  // null if property didn't exist
  };
  after: {
    property: string;
    value: string | null;  // null if removing property
  };
}

/**
 * Text content change command.
 */
interface TextCommand extends BaseCommand {
  type: 'update-text';
  before: string;
  after: string;
}

/**
 * Variant operation command.
 */
interface VariantCommand extends BaseCommand {
  type: 'add-variant' | 'apply-variant' | 'remove-variant';
  variantName: string;
  before: {
    className: string;        // Full className before
    appliedVariants: string[];
  };
  after: {
    className: string;        // Full className after
    appliedVariants: string[];
  };
  /** For add-variant, the styles that were added */
  styles?: Record<string, string>;
}

type Command = StyleCommand | TextCommand | VariantCommand;
```

### 7.2 Command Stack Behavior

```
┌─────────────────────────────────────────────────────────────┐
│                      Command Stack                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                    Undo Stack                        │   │
│   │  [cmd1] [cmd2] [cmd3] [cmd4] ← newest               │   │
│   └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│                          │ Undo                              │
│                          ▼                                   │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                    Redo Stack                        │   │
│   │  [cmd5] [cmd6] ← popped from undo                   │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   Rules:                                                     │
│   1. New action → push to undo, clear redo                  │
│   2. Undo → pop from undo, push to redo, apply reverse      │
│   3. Redo → pop from redo, push to undo, apply forward      │
│   4. External file change → clear commands for that file    │
│   5. Max stack size → evict oldest when exceeded            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Zod Schemas (Runtime Validation)

All data crossing system boundaries is validated with Zod schemas. This ensures type safety at runtime for WebSocket messages, API requests, and configuration files.

### 8.1 Schema Organization

```
packages/
├── shared/
│   └── src/
│       └── schemas/
│           ├── index.ts          # Re-exports all schemas
│           ├── element.ts        # Element targeting schemas
│           ├── transform.ts      # Transform request/response
│           ├── styles.ts         # CSS value schemas
│           ├── websocket.ts      # WebSocket message schemas
│           └── config.ts         # Configuration schemas
```

### 8.2 Element Schemas

```typescript
// schemas/element.ts
import { z } from 'zod';

/**
 * CSS unit values
 */
export const CSSUnitSchema = z.enum([
  'px', 'rem', 'em', '%', 'vh', 'vw', 'auto', 'none', ''
]);

export type CSSUnit = z.infer<typeof CSSUnitSchema>;

/**
 * Element target - identifies an element in source code
 */
export const ElementTargetSchema = z.object({
  file: z.string().min(1).regex(/\.(tsx?|jsx?)$/, 'Must be a TypeScript/JavaScript file'),
  lineNumber: z.number().int().positive(),
  column: z.number().int().positive(),
  cssFile: z.string().min(1).regex(/\.module\.css$/, 'Must be a CSS Module file'),
  selector: z.string().min(1).startsWith('.'),
});

export type ElementTarget = z.infer<typeof ElementTargetSchema>;

/**
 * Box model sides
 */
export const BoxSidesSchema = z.object({
  top: z.string(),
  right: z.string(),
  bottom: z.string(),
  left: z.string(),
});

export type BoxSides = z.infer<typeof BoxSidesSchema>;

/**
 * Box model corners (for border-radius)
 */
export const BoxCornersSchema = z.object({
  topLeft: z.string(),
  topRight: z.string(),
  bottomRight: z.string(),
  bottomLeft: z.string(),
});

export type BoxCorners = z.infer<typeof BoxCornersSchema>;
```

### 8.3 Transform Schemas

```typescript
// schemas/transform.ts
import { z } from 'zod';
import { ElementTargetSchema } from './element';

/**
 * Transform types
 */
export const TransformTypeSchema = z.enum([
  'css-update',
  'css-add',
  'css-remove',
  'text-update',
  'add-variant',
  'apply-variant',
  'remove-variant',
]);

export type TransformType = z.infer<typeof TransformTypeSchema>;

/**
 * CSS property change
 */
export const CSSChangeSchema = z.object({
  property: z.string().min(1),
  value: z.string(),
});

/**
 * Text content change
 */
export const TextChangeSchema = z.object({
  originalText: z.string(),
  newText: z.string(),
});

/**
 * Add variant change
 */
export const AddVariantChangeSchema = z.object({
  variantName: z.string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/, 'Invalid CSS class name'),
  cssFile: z.string().endsWith('.module.css'),
  styles: z.record(z.string(), z.string()).refine(
    (obj) => Object.keys(obj).length > 0,
    'At least one style required'
  ),
});

/**
 * Apply/Remove variant change
 */
export const VariantRefChangeSchema = z.object({
  variantName: z.string().min(1),
});

/**
 * Union of all change types
 */
export const TransformChangeSchema = z.union([
  CSSChangeSchema,
  TextChangeSchema,
  AddVariantChangeSchema,
  VariantRefChangeSchema,
]);

export type TransformChange = z.infer<typeof TransformChangeSchema>;

/**
 * Transform request (client → server)
 */
export const TransformRequestSchema = z.object({
  id: z.string().uuid(),
  type: TransformTypeSchema,
  target: ElementTargetSchema,
  change: TransformChangeSchema,
});

export type TransformRequest = z.infer<typeof TransformRequestSchema>;

/**
 * Error codes
 */
export const ErrorCodeSchema = z.enum([
  'FILE_NOT_FOUND',
  'FILE_READ_ERROR',
  'FILE_WRITE_ERROR',
  'FILE_PARSE_ERROR',
  'SELECTOR_NOT_FOUND',
  'PROPERTY_NOT_FOUND',
  'INVALID_CSS_VALUE',
  'CSS_SYNTAX_ERROR',
  'VARIANT_ALREADY_EXISTS',
  'VARIANT_NOT_FOUND',
  'ELEMENT_NOT_FOUND',
  'ELEMENT_MOVED',
  'TEXT_NOT_FOUND',
  'CLASSNAME_INVALID',
  'JSX_SYNTAX_ERROR',
  'TRANSACTION_FAILED',
  'ROLLBACK_FAILED',
  'CONNECTION_LOST',
  'TIMEOUT',
  'UNKNOWN_ERROR',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * Transform error
 */
export const TransformErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type TransformError = z.infer<typeof TransformErrorSchema>;

/**
 * Transform result (server → client)
 */
export const TransformResultSchema = z.object({
  success: z.boolean(),
  requestId: z.string().uuid(),
  affectedFiles: z.array(z.string()).optional(),
  error: TransformErrorSchema.optional(),
});

export type TransformResult = z.infer<typeof TransformResultSchema>;
```

### 8.4 Style Schemas

```typescript
// schemas/styles.ts
import { z } from 'zod';

/**
 * Color formats
 */
export const ColorFormatSchema = z.enum([
  'hex', 'rgb', 'rgba', 'hsl', 'hsla', 'named', 'var'
]);

/**
 * Color value
 */
export const ColorValueSchema = z.object({
  format: ColorFormatSchema,
  raw: z.string(),
  resolved: z.string().optional(),
  components: z.object({
    r: z.number().min(0).max(255).optional(),
    g: z.number().min(0).max(255).optional(),
    b: z.number().min(0).max(255).optional(),
    h: z.number().min(0).max(360).optional(),
    s: z.number().min(0).max(100).optional(),
    l: z.number().min(0).max(100).optional(),
    a: z.number().min(0).max(1).optional(),
  }).optional(),
});

export type ColorValue = z.infer<typeof ColorValueSchema>;

/**
 * Property in a variant (from CSS file)
 * NOTE: Element computed styles are read from browser via getComputedStyle(),
 * NOT from server. This type is only used for variant properties.
 */
export const VariantPropertySchema = z.object({
  property: z.string(),
  value: StyleValueSchema,       // Typed CSS value
  rawValue: z.string(),          // Original string from CSS file
  lineNumber: z.number().int().positive(),
});

export type VariantProperty = z.infer<typeof VariantPropertySchema>;

/**
 * Variant info
 */
export const VariantInfoSchema = z.object({
  name: z.string(),
  selector: z.string(),
  lineNumber: z.number().int().positive(),
  properties: z.array(VariantPropertySchema),
});

export type VariantInfo = z.infer<typeof VariantInfoSchema>;
```

### 8.5 WebSocket Message Schemas

```typescript
// schemas/websocket.ts
import { z } from 'zod';
import { ElementTargetSchema } from './element';
import { TransformRequestSchema, TransformResultSchema, TransformErrorSchema } from './transform';
import { VariantInfoSchema } from './styles';

/**
 * Client action types
 * NOTE: 'get-styles' removed - computed styles come from browser's getComputedStyle()
 */
export const ClientActionSchema = z.enum([
  'transform',
  'get-variants',
  'ping',
]);

/**
 * Server message types
 * NOTE: 'styles' removed - computed styles come from browser, not server
 * NOTE: 'external-change' removed - detected via Vite HMR instead
 */
export const ServerMessageTypeSchema = z.enum([
  'connected',
  'transform-result',
  'variants',
  'error',
  'pong',
]);

// === Client → Server Messages ===

export const WSTransformMessageSchema = z.object({
  action: z.literal('transform'),
  id: z.string().uuid(),
  type: z.string(),
  target: ElementTargetSchema,
  change: z.record(z.unknown()),
});

export const WSGetVariantsMessageSchema = z.object({
  action: z.literal('get-variants'),
  id: z.string(),
  cssFile: z.string().endsWith('.module.css'),
});

export const WSPingMessageSchema = z.object({
  action: z.literal('ping'),
  id: z.string(),
});

export const WSClientMessageSchema = z.discriminatedUnion('action', [
  WSTransformMessageSchema,
  WSGetVariantsMessageSchema,
  WSPingMessageSchema,
]);

export type WSClientMessage = z.infer<typeof WSClientMessageSchema>;

// === Server → Client Messages ===

export const WSConnectedMessageSchema = z.object({
  type: z.literal('connected'),
  clientId: z.string(),
  serverVersion: z.string(),
  projectDir: z.string(),
});

export const WSTransformResultMessageSchema = z.object({
  type: z.literal('transform-result'),
  requestId: z.string(),
  success: z.boolean(),
  affectedFiles: z.array(z.string()).optional(),
  error: TransformErrorSchema.optional(),
});

export const WSVariantsMessageSchema = z.object({
  type: z.literal('variants'),
  requestId: z.string(),
  baseClass: z.string(),
  variants: z.array(VariantInfoSchema),
});

export const WSErrorMessageSchema = z.object({
  type: z.literal('error'),
  error: TransformErrorSchema,
});

export const WSPongMessageSchema = z.object({
  type: z.literal('pong'),
  requestId: z.string(),
  serverTime: z.number(),
});

export const WSServerMessageSchema = z.discriminatedUnion('type', [
  WSConnectedMessageSchema,
  WSTransformResultMessageSchema,
  WSVariantsMessageSchema,
  WSErrorMessageSchema,
  WSPongMessageSchema,
]);

export type WSServerMessage = z.infer<typeof WSServerMessageSchema>;
```

### 8.6 Configuration Schemas

```typescript
// schemas/config.ts
import { z } from 'zod';

/**
 * Alara configuration file (alara.config.ts)
 */
export const AlaraConfigSchema = z.object({
  /** Port for Alara service */
  port: z.number().int().min(1024).max(65535).default(4000),

  /** Source directory relative to project root */
  srcDir: z.string().default('src'),

  /** Components directory relative to srcDir */
  componentsDir: z.string().default('components'),

  /** Patterns to exclude from watching */
  exclude: z.array(z.string()).default([
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
  ]),

  /** CSS variable files to include */
  cssVariableFiles: z.array(z.string()).default([
    'src/styles/variables.css',
    'src/index.css',
  ]),

  /** Enable/disable features */
  features: z.object({
    textEditing: z.boolean().default(true),
    variantCreation: z.boolean().default(true),
    colorPicker: z.boolean().default(true),
  }).default({}),
});

export type AlaraConfig = z.infer<typeof AlaraConfigSchema>;

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: AlaraConfig = AlaraConfigSchema.parse({});
```

### 8.7 Validation Helpers

```typescript
// schemas/validation.ts
import { z, ZodError } from 'zod';
import { WSClientMessageSchema, WSServerMessageSchema } from './websocket';
import { TransformRequestSchema } from './transform';

/**
 * Validate and parse a WebSocket message from client
 */
export function parseClientMessage(data: unknown): WSClientMessage {
  return WSClientMessageSchema.parse(data);
}

/**
 * Safe parse with error details
 */
export function safeParseClientMessage(data: unknown): {
  success: true;
  data: WSClientMessage;
} | {
  success: false;
  error: ZodError;
} {
  const result = WSClientMessageSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate transform request
 */
export function validateTransformRequest(data: unknown): TransformRequest {
  return TransformRequestSchema.parse(data);
}

/**
 * Format Zod errors for user display
 */
export function formatZodError(error: ZodError): string {
  return error.errors
    .map(e => `${e.path.join('.')}: ${e.message}`)
    .join(', ');
}

/**
 * Create a validation middleware for the WebSocket handler
 */
export function createValidationMiddleware() {
  return {
    validateIncoming(message: string): WSClientMessage {
      try {
        const parsed = JSON.parse(message);
        return parseClientMessage(parsed);
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error('Invalid JSON');
        }
        if (error instanceof ZodError) {
          throw new Error(`Validation failed: ${formatZodError(error)}`);
        }
        throw error;
      }
    },

    validateOutgoing(message: unknown): string {
      // Validate server messages in development
      if (process.env.NODE_ENV === 'development') {
        WSServerMessageSchema.parse(message);
      }
      return JSON.stringify(message);
    },
  };
}
```

### 8.8 Usage in WebSocket Handler

```typescript
// ws/handler.ts
import { createValidationMiddleware } from '@alara/core/shared';

export function createWebSocketHandler(engine: TransformEngine) {
  const validator = createValidationMiddleware();

  return {
    async message(ws: ServerWebSocket, rawMessage: string) {
      try {
        // Validate incoming message
        const message = validator.validateIncoming(rawMessage);

        switch (message.action) {
          case 'transform':
            const result = await engine.transform({
              id: message.id,
              type: message.type as TransformType,
              target: message.target,
              change: message.change as TransformChange,
            });

            // Validate and send response
            ws.send(validator.validateOutgoing({
              type: 'transform-result',
              ...result,
            }));
            break;

          // ... other cases
        }
      } catch (error) {
        ws.send(validator.validateOutgoing({
          type: 'error',
          error: {
            code: 'UNKNOWN_ERROR',
            message: error.message,
          },
        }));
      }
    },
  };
}
```

---

## 9. Data Flow Diagrams

### 8.1 Style Update Flow

```
User changes padding in FloatingToolbox
                │
                ▼
┌───────────────────────────────┐
│  EditorStore.updateStyle()    │
│                               │
│  1. Create StyleCommand       │
│     { before: '12px',         │
│       after: '16px' }         │
│                               │
│  2. Push to undoStack         │
│                               │
│  3. Add to pendingEdits       │
│     (shows loading indicator) │
│                               │
│  4. Send via WebSocket        │
│                               │
│  NOTE: No optimistic DOM      │
│  update - wait for Vite HMR   │
└──────────────┬────────────────┘
               │
               ▼ WebSocket
┌───────────────────────────────┐
│  TransformEngine              │
│  → Transform Registry         │
│                               │
│  1. Look up 'css-update'      │
│     handler in registry       │
│                               │
│  2. Validate with Zod schema  │
│                               │
│  3. Handler executes:         │
│     - Get cached CSS AST      │
│     - Find .button rule       │
│     - Update padding decl     │
│                               │
│  4. Transaction.commit()      │
└──────────────┬────────────────┘
               │
               ▼ File System
┌───────────────────────────────┐
│  Vite detects change          │
│                               │
│  HMR hot-swaps CSS            │
│  (DOM updated automatically)  │
└──────────────┬────────────────┘
               │
               ▼ WebSocket
┌───────────────────────────────┐
│  EditorStore receives result  │
│                               │
│  1. markEditCommitted()       │
│                               │
│  2. Remove from pendingEdits  │
│     (hide loading indicator)  │
│                               │
│  3. DOM already updated by    │
│     Vite HMR                  │
└───────────────────────────────┘
```

### 8.2 External Change Flow

External file changes are detected via **Vite HMR**, not WebSocket broadcast.
This eliminates race conditions between HMR DOM updates and WebSocket messages.

```
User edits file in VS Code
                │
                ▼
┌───────────────────────────────┐
│  Vite detects file change     │
│                               │
│  1. Vite HMR processes change │
│                               │
│  2. Updates DOM with new      │
│     styles / component code   │
│                               │
│  3. Fires 'vite:beforeUpdate' │
│     event in browser          │
└──────────────┬────────────────┘
               │
               ▼ Browser (Vite HMR event)
┌───────────────────────────────┐
│  useViteHMR hook receives     │
│  'vite:beforeUpdate' event    │
│                               │
│  For each update.path:        │
│                               │
│  1. clearPendingEditsForFile  │
│     (discard in-flight edits) │
│                               │
│  2. clearUndoRedoForFile      │
│     (external edit invalidates│
│      our command history)     │
│                               │
│  3. refreshSelectedElement    │
│     (re-read computed styles) │
└───────────────────────────────┘
               │
               ▼ Parallel (Server side)
┌───────────────────────────────┐
│  FileWatcher detects change   │
│                               │
│  1. Debounce 100ms            │
│                               │
│  2. Invalidate CSS cache      │
│     (lazy - on next request)  │
│                               │
│  (NO WebSocket broadcast)     │
└───────────────────────────────┘
```

**Why Vite HMR instead of WebSocket?**
- Single source of truth - Vite HMR already updates DOM
- No race conditions between HMR and WebSocket
- Simpler architecture - one event to handle

### 8.3 Variant Creation Flow

```
User creates "large" variant
                │
                ▼
┌───────────────────────────────┐
│  EditorStore.createVariant()  │
│                               │
│  1. Create VariantCommand     │
│                               │
│  2. Send add-variant request  │
└──────────────┬────────────────┘
               │
               ▼ WebSocket
┌───────────────────────────────┐
│  TransformEngine              │
│  → Transform Registry         │
│  → 'add-variant' handler      │
│                               │
│  Transaction:                 │
│  ┌─────────────────────────┐  │
│  │ 1. CSS handler logic:   │  │
│  │    Create .large class  │  │
│  │    in Button.module.css │  │
│  ├─────────────────────────┤  │
│  │ 2. JSX handler logic:   │  │
│  │    Update className:    │  │
│  │    {styles.button} →    │  │
│  │    {`${styles.button}   │  │
│  │      ${styles.large}`}  │  │
│  └─────────────────────────┘  │
│                               │
│  3. Transaction.commit()      │
│     (write both files)        │
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│  Vite HMR updates both        │
│  CSS and JSX modules          │
└───────────────────────────────┘
```

---

## Summary

| Data Type | Location | Lifecycle | Invalidation |
|-----------|----------|-----------|--------------|
| Selection state | Browser (Zustand) | Session | User action |
| Pending edits | Browser (Zustand) | Until confirmed | Server response |
| Undo/Redo stack | Browser (Zustand) | Session | External file change |
| UI preferences | Browser (localStorage) | Persistent | User action |
| Element styles cache | Browser (Zustand) | Session | External file change |
| CSS AST | Server (CSSCache) | Until file change | Lazy invalidation |
| JSX AST | Not cached | N/A | Parsed on each request |
| Source files | File System | Persistent | Editor/IDE |
