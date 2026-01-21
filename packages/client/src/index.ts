import { createEditorStore, type EditorStore } from './store.js';
import { attachSelectionHandlers } from './selection.js';
import { attachTextEditHandlers } from './text-editing.js';
import { renderOverlays } from './overlays.js';
import { connectWebSocket } from './websocket.js';

// Import behaviors to register them
import './behaviors/handlers/text-edit.js';

// Re-export types and utilities
export { createEditorStore, type EditorStore } from './store.js';
export type { SelectedElement, HoveredElement, TextEditState, PendingEdit, ConnectionStatus, EditorState, EditorActions } from './store.js';
export { editorBehaviorsRegistry, isTextEditableElement, TEXT_EDITABLE_TAGS } from './behaviors/registry.js';
export type { EditorBehavior, BehaviorContext } from './behaviors/registry.js';

export interface AlaraClientOptions {
  /** Alara server port (default: 4000) */
  port?: number;
}

interface AlaraClient {
  /** The editor store instance */
  store: EditorStore;
  /** Cleanup function to destroy the client */
  destroy: () => void;
}

// Global client instance (for HMR support)
let globalClient: AlaraClient | null = null;

/**
 * Initialize the Alara client.
 * This sets up:
 * - Editor store
 * - WebSocket connection to Alara service
 * - Selection/hover event handlers
 * - Text editing handlers
 * - Overlay rendering
 *
 * @param options - Configuration options
 * @returns The client instance with store and destroy function
 */
export function initAlaraClient(options: AlaraClientOptions = {}): AlaraClient {
  // Clean up existing client (for HMR)
  if (globalClient) {
    globalClient.destroy();
    globalClient = null;
  }

  const port = options.port ?? 4000;
  const wsUrl = `ws://localhost:${port}/ws`;

  // Create store
  const store = createEditorStore();

  // Collect cleanup functions
  const cleanupFns: (() => void)[] = [];

  // Connect to Alara service
  cleanupFns.push(connectWebSocket(store, wsUrl));

  // Attach event handlers
  cleanupFns.push(attachSelectionHandlers(store));
  cleanupFns.push(attachTextEditHandlers(store));

  // Render overlay container
  cleanupFns.push(renderOverlays(store));

  console.log('[Alara] Client initialized');

  // Create client instance
  const client: AlaraClient = {
    store,
    destroy: () => {
      cleanupFns.forEach((fn) => fn());
      console.log('[Alara] Client destroyed');
    },
  };

  // Store globally for HMR
  globalClient = client;

  // Expose for debugging
  if (typeof window !== 'undefined') {
    (window as unknown as { __ALARA__: AlaraClient }).__ALARA__ = client;
  }

  return client;
}

// Default export for convenience
export default initAlaraClient;
