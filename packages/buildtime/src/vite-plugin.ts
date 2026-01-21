import type { Plugin } from 'vite';

export interface AlaraPluginOptions {
  /** Alara server port (default: 4000) */
  serverPort?: number;
}

const VIRTUAL_CLIENT_ID = '/@alara/client';
const RESOLVED_VIRTUAL_CLIENT_ID = '\0@alara/client';

export function alaraPlugin(options: AlaraPluginOptions = {}): Plugin {
  const serverPort = options.serverPort ?? 4000;

  return {
    name: 'alara',
    enforce: 'pre',

    // Phase 0.2: No-op transform (Babel integration is Phase 2.4)
    transform(code: string, id: string) {
      // Only transform TSX/JSX in src/
      if (
        !id.includes('/src/') ||
        (!id.endsWith('.tsx') && !id.endsWith('.jsx'))
      ) {
        return null;
      }

      // Skip node_modules
      if (id.includes('node_modules')) {
        return null;
      }

      // TODO: Phase 2.4 - Babel plugin for oid + css attribute injection
      return null;
    },

    // Inject Alara client script into HTML
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [
          {
            tag: 'script',
            attrs: { type: 'module', src: VIRTUAL_CLIENT_ID },
            injectTo: 'head',
          },
        ],
      };
    },

    // Resolve virtual module for client script
    resolveId(id: string) {
      if (id === VIRTUAL_CLIENT_ID) {
        return RESOLVED_VIRTUAL_CLIENT_ID;
      }
    },

    // Serve the client script
    load(id: string) {
      if (id === RESOLVED_VIRTUAL_CLIENT_ID) {
        return generateClientScript(serverPort);
      }
    },
  };
}

function generateClientScript(port: number): string {
  return `
const ALARA_WS_URL = 'ws://localhost:${port}/ws';

let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 1000;

function connect() {
  ws = new WebSocket(ALARA_WS_URL);

  ws.onopen = () => {
    console.log('[Alara] Connected to dev server');
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('[Alara] Received:', message);
    } catch (e) {
      console.error('[Alara] Failed to parse message:', e);
    }
  };

  ws.onclose = () => {
    console.log('[Alara] Disconnected');
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log('[Alara] Reconnecting in ' + RECONNECT_DELAY + 'ms (attempt ' + reconnectAttempts + ')');
      setTimeout(connect, RECONNECT_DELAY);
    }
  };

  ws.onerror = (error) => {
    console.error('[Alara] WebSocket error:', error);
  };
}

// Expose for debugging
window.__ALARA_WS__ = () => ws;

// Connect on load
connect();
`;
}
