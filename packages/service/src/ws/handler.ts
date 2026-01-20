import type { ServerWebSocket } from 'bun';

export interface WebSocketData {
  connectedAt: number;
}

interface ServerMessage {
  type: string;
  requestId?: string;
  [key: string]: unknown;
}

function send(ws: ServerWebSocket<WebSocketData>, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

export function createWebSocketHandler() {
  return {
    open(ws: ServerWebSocket<WebSocketData>) {
      console.log('[WS] Client connected');
      send(ws, { type: 'connected' });
    },

    message(ws: ServerWebSocket<WebSocketData>, msg: string | Buffer) {
      try {
        const raw = typeof msg === 'string' ? msg : msg.toString();
        const message = JSON.parse(raw);

        // Handle ping for connection health checks
        if (message.action === 'ping') {
          send(ws, { type: 'pong', requestId: message.id });
          return;
        }

        // Phase 0: Echo all other messages back
        console.log('[WS] Received:', message);
        ws.send(raw);
      } catch (error) {
        console.error('[WS] Failed to parse message:', error);
        send(ws, {
          type: 'error',
          message: 'Invalid JSON message',
        });
      }
    },

    close(ws: ServerWebSocket<WebSocketData>, code: number, reason: string) {
      console.log(`[WS] Client disconnected (code: ${code}, reason: ${reason || 'none'})`);
    },
  };
}
