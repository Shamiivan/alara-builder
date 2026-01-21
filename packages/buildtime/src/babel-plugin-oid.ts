import type { PluginObj, types as t } from '@babel/core';
import { relative } from 'path';

export interface BabelPluginOidOptions {
  /** Base directory for relative paths (typically the project root) */
  root?: string;
  /** Attribute name for the oid (default: 'oid') */
  attributeName?: string;
}

interface BabelAPI {
  assertVersion(version: number): void;
  types: typeof t;
}

interface PluginState {
  filename?: string;
}

/**
 * Babel plugin that injects `oid` attributes into JSX elements.
 * The oid format is: `{relativePath}:{line}:{column}`
 *
 * Example:
 * ```tsx
 * // Input
 * <h1>Hello</h1>
 *
 * // Output (at build time)
 * <h1 oid="src/App.tsx:5:4">Hello</h1>
 * ```
 */
export function babelPluginOid(
  api: BabelAPI,
  options: BabelPluginOidOptions = {}
): PluginObj<PluginState> {
  api.assertVersion(7);

  const { root = process.cwd(), attributeName = 'oid' } = options;
  const types = api.types;

  return {
    name: 'babel-plugin-oid',

    visitor: {
      JSXOpeningElement(path, state) {
        const { node } = path;
        const { filename } = state;

        // Skip if no filename or location
        if (!filename || !node.loc) {
          return;
        }

        // Skip if already has oid attribute
        const hasOid = node.attributes.some(
          (attr): attr is t.JSXAttribute =>
            attr.type === 'JSXAttribute' &&
            attr.name.type === 'JSXIdentifier' &&
            attr.name.name === attributeName
        );

        if (hasOid) {
          return;
        }

        // Get relative path from root
        const relativePath = relative(root, filename).replace(/\\/g, '/');

        // Get location (1-indexed line and column)
        const { line, column } = node.loc.start;
        // Babel columns are 0-indexed, we need 1-indexed
        const col = column + 1;

        // Create the oid value
        const oidValue = `${relativePath}:${line}:${col}`;

        // Create the oid attribute
        const oidAttribute = types.jsxAttribute(
          types.jsxIdentifier(attributeName),
          types.stringLiteral(oidValue)
        );

        // Add the attribute to the element
        node.attributes.push(oidAttribute);
      },
    },
  };
}

export default babelPluginOid;
