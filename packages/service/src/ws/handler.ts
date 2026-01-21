import type { ServerWebSocket } from 'bun';
import { transformRegistry } from '../transforms/registry';
// Import handlers to register them
import '../transforms/handlers';

export interface WebSocketData {
  connectedAt: number;
  projectDir: string;
}

interface ServerMessage {
  type: string;
  requestId?: string;
  [key: string]: unknown;
}

interface TransformRequestMessage {
  action: 'transform';
  id: string;
  type: string;
  target: unknown;
  change: unknown;
}

function send(ws: ServerWebSocket<WebSocketData>, message: ServerMessage): void {
  ws.send(JSON.stringify(message));
}

function isTransformRequest(message: unknown): message is TransformRequestMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as Record<string, unknown>).action === 'transform' &&
    'type' in message &&
    'id' in message
  );
}

export function createWebSocketHandler(projectDir: string) {
  return {
    open(ws: ServerWebSocket<WebSocketData>) {
      console.log('[WS] Client connected');
      ws.data.projectDir = projectDir;
      send(ws, { type: 'connected' });
    },

    async message(ws: ServerWebSocket<WebSocketData>, msg: string | Buffer) {
      try {
        const raw = typeof msg === 'string' ? msg : msg.toString();
        const message = JSON.parse(raw);

        // Handle ping for connection health checks
        if (message.action === 'ping') {
          console.log('[WS] Ping received', message);
          send(ws, { type: 'pong', requestId: message.id });
          return;
        }

        // Handle transform requests
        if (isTransformRequest(message)) {
          console.log('[WS] Transform request:', message.type, message.id);

          const result = await transformRegistry.execute(
            message.type,
            { target: message.target, change: message.change },
            { projectDir: ws.data.projectDir }
          );

          // Set the requestId from the original message
          result.requestId = message.id;

          send(ws, {
            type: 'transform-result',
            ...result,
          });
          return;
        }

        // Echo all other messages back (for debugging/testing)
        console.log('[WS] Received:', message);
        ws.send(raw);
      } catch (error) {
        console.error('[WS] Failed to process message:', error);
        send(ws, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Invalid message',
        });
      }
    },

    close(_ws: ServerWebSocket<WebSocketData>, code: number, reason: string) {
      console.log(`[WS] Client disconnected (code: ${code}, reason: ${reason || 'none'})`);
    },
  };
}
