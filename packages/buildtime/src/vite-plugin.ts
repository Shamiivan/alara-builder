import type { Plugin } from 'vite';
import { transformSync } from '@babel/core';
import { babelPluginOid } from './babel-plugin-oid';

export interface AlaraPluginOptions {
  /** Alara server port (default: 4000) */
  serverPort?: number;
}

const VIRTUAL_CLIENT_ID = '/@alara/client';
const RESOLVED_VIRTUAL_CLIENT_ID = '\0@alara/client';

export function alaraPlugin(options: AlaraPluginOptions = {}): Plugin {
  const serverPort = options.serverPort ?? 4000;
  let projectRoot = process.cwd();

  return {
    name: 'alara',
    enforce: 'pre',

    configResolved(config) {
      projectRoot = config.root;
    },

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

      // Transform with Babel to inject oid attributes
      const result = transformSync(code, {
        filename: id,
        plugins: [
          ['@babel/plugin-syntax-typescript', { isTSX: true }],
          [babelPluginOid, { root: projectRoot }],
        ],
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
        sourceMaps: true,
        // Don't transform ES modules - let Vite/esbuild handle that
        presets: [],
      });

      if (!result || !result.code) {
        return null;
      }

      return {
        code: result.code,
        map: result.map,
      };
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

    // Serve the client initialization script
    load(id: string) {
      if (id === RESOLVED_VIRTUAL_CLIENT_ID) {
        // Import and initialize the client from @alara/client package
        return `
import { initAlaraClient } from '@alara/client';
initAlaraClient({ port: ${serverPort} });
`;
      }
    },
  };
}
