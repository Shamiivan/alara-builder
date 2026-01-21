import type { EditorStore } from './store.js';

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 10000;

interface WebSocketManagerState {
  ws: WebSocket | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  isIntentionalClose: boolean;
}

/**
 * Handle incoming server messages.
 */
function handleServerMessage(
  message: { type: string; requestId?: string; success?: boolean; error?: { message: string } },
  store: EditorStore
): void {
  switch (message.type) {
    case 'connected':
      console.log('[Alara] Server acknowledged connection');
      break;

    case 'transform-result':
      if (message.requestId) {
        if (message.success) {
          store.getState().markEditCommitted(message.requestId);
        } else {
          store.getState().markEditFailed(
            message.requestId,
            message.error?.message ?? 'Unknown error'
          );
        }
      }
      break;

    case 'pong':
      // Connection health check response
      break;

    default:
      console.log('[Alara] Unknown message type:', message.type);
  }
}

/**
 * Connect to the Alara WebSocket server.
 * Returns a cleanup function.
 */
export function connectWebSocket(store: EditorStore, url: string): () => void {
  const state: WebSocketManagerState = {
    ws: null,
    reconnectAttempts: 0,
    reconnectTimer: null,
    isIntentionalClose: false,
  };

  /**
   * Calculate exponential backoff delay.
   */
  function getReconnectDelay(): number {
    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, state.reconnectAttempts);
    return Math.min(delay, MAX_RECONNECT_DELAY);
  }

  /**
   * Attempt to establish WebSocket connection.
   */
  function connect(): void {
    if (state.isIntentionalClose) {
      return;
    }

    store.getState().setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[Alara] Connected to server');
        state.ws = ws;
        state.reconnectAttempts = 0;
        store.getState().setWebSocket(ws);
        store.getState().setConnectionStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleServerMessage(message, store);
        } catch (e) {
          console.error('[Alara] Failed to parse message:', e);
        }
      };

      ws.onclose = (event) => {
        console.log('[Alara] Disconnected:', event.code, event.reason);
        state.ws = null;
        store.getState().setWebSocket(null);

        if (state.isIntentionalClose) {
          store.getState().setConnectionStatus('disconnected');
          return;
        }

        // Attempt reconnection
        if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          const delay = getReconnectDelay();
          console.log(`[Alara] Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          store.getState().setConnectionStatus('disconnected');

          state.reconnectTimer = setTimeout(() => {
            state.reconnectAttempts++;
            connect();
          }, delay);
        } else {
          console.error('[Alara] Max reconnection attempts reached');
          store.getState().setConnectionStatus('error', 'Unable to connect to Alara server');
        }
      };

      ws.onerror = (error) => {
        console.error('[Alara] WebSocket error:', error);
        // The close event will handle reconnection
      };
    } catch (error) {
      console.error('[Alara] Failed to create WebSocket:', error);
      store.getState().setConnectionStatus('error', 'Failed to create connection');

      // Retry if we haven't exceeded attempts
      if (state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = getReconnectDelay();
        state.reconnectTimer = setTimeout(() => {
          state.reconnectAttempts++;
          connect();
        }, delay);
      }
    }
  }

  // Start connection
  connect();

  // Return cleanup function
  return () => {
    state.isIntentionalClose = true;

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }

    store.getState().setWebSocket(null);
    store.getState().setConnectionStatus('disconnected');
  };
}
