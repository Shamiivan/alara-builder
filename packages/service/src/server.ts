import { createWebSocketHandler, type WebSocketData } from './ws/handler';

export interface ServerConfig {
  port: number;
  projectDir: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function createServer(config: ServerConfig) {
  const wsHandler = createWebSocketHandler();

  const server = Bun.serve<WebSocketData>({
    port: config.port,

    fetch(req, server) {
      const url = new URL(req.url);

      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
      }

      // WebSocket upgrade
      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req, {
          data: { connectedAt: Date.now() },
        });

        if (upgraded) {
          return undefined;
        }

        return new Response('WebSocket upgrade failed', {
          status: 400,
          headers: CORS_HEADERS,
        });
      }

      // Health check
      if (url.pathname === '/health') {
        return Response.json(
          { status: 'ok', projectDir: config.projectDir },
          { headers: CORS_HEADERS }
        );
      }

      // Default response
      return new Response('Alara Dev Server', {
        headers: CORS_HEADERS,
      });
    },

    websocket: wsHandler,
  });

  return server;
}
