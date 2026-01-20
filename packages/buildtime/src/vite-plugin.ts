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
// Alara Client - Phase 0.4
const ALARA_WS_URL = 'ws://localhost:${port}/ws';

let ws = null;
let status = 'disconnected';
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 1000;
const pending = new Map();

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function connect() {
  status = 'connecting';
  ws = new WebSocket(ALARA_WS_URL);

  ws.onopen = () => {
    console.log('[Alara] Connected');
    status = 'connected';
    reconnectAttempts = 0;
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      console.log('[Alara] ←', msg);

      // Handle response correlation
      if (msg.requestId && pending.has(msg.requestId)) {
        const { resolve } = pending.get(msg.requestId);
        pending.delete(msg.requestId);
        resolve(msg);
      }
    } catch (e) {
      console.error('[Alara] Parse error:', e);
    }
  };

  ws.onclose = () => {
    console.log('[Alara] Disconnected');
    status = 'disconnected';

    // Reject pending requests
    pending.forEach(({ reject }) => reject(new Error('Connection closed')));
    pending.clear();

    // Reconnect
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log('[Alara] Reconnecting... (attempt ' + reconnectAttempts + ')');
      setTimeout(connect, RECONNECT_DELAY);
    }
  };

  ws.onerror = () => {
    status = 'error';
  };
}

function send(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (status !== 'connected') {
      reject(new Error('Not connected'));
      return;
    }

    const id = generateId();
    const msg = { action, id, ...payload };

    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify(msg));
    console.log('[Alara] →', msg);

    // Timeout after 10s
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 10000);
  });
}

// Expose API
window.__ALARA__ = {
  send,
  ping: () => send('ping'),
  status: () => status,
  ws: () => ws,
};

connect();
`;
}
