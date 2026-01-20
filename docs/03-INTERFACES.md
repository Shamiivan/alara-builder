# 03 - Interface Definitions

This document defines all API contracts, message formats, and TypeScript interfaces for communication between Alara components.

> **Note**: All types in this document are derived from Zod schemas defined in `@alara/core/shared`.
> See [04-DATA-DESIGN.md](./04-DATA-DESIGN.md#8-zod-schemas-runtime-validation) for the complete Zod schema definitions.
> TypeScript types are inferred using `z.infer<typeof Schema>`.
> We use runtime validation for debugging purposes. HMR may change file references a lot so we use runtime validation to catch any issues.
>
> **CSS Values**: All CSS property values use the **Typed CSS Value System** defined in [04-DATA-DESIGN.md](./04-DATA-DESIGN.md#4-typed-css-value-system).
> This enables validation, smart UI controls, and semantic operations on CSS values.

## Table of Contents

1. [WebSocket Protocol](#1-websocket-protocol)
2. [HTTP Endpoint](#2-http-endpoint)
3. [Core Type Definitions](#3-core-type-definitions)
4. [Transform Request/Response Types](#4-transform-requestresponse-types)
5. [Store Interfaces](#5-store-interfaces)
6. [Component Props Interfaces](#6-component-props-interfaces)
7. [Error Codes](#7-error-codes)

---

## 1. WebSocket Protocol

All WebSocket messages are JSON-encoded. The protocol uses a request/response pattern with event broadcasting for external changes.

> **Architecture Note: Client-Driven Computed Styles**
>
> The client sends computed styles (from `getComputedStyle()`) along with transform requests.
> The server does NOT send styles to the client - computed styles are already available in the browser.
>
> **Why this approach?**
> - Browser has the authoritative computed styles - no need to duplicate on server
> - Eliminates round-trip latency for fetching styles before editing
> - Server focuses on resolution: finding which CSS file/selector owns the property
> - Simpler protocol: transform requests are self-contained with all needed context

### 1.1 Connection

**Endpoint**: `ws://localhost:4000/ws`

**Connection Lifecycle**:
```
Client                              Server
   |                                   |
   |──── WebSocket Connect ───────────>|
   |                                   |
   |<─── { type: "connected" } ────────|
   |                                   |
   |──── { action: "transform" } ─────>|
   |<─── { type: "transform-result" } ─|
   |                                   |
   |──── WebSocket Close ─────────────>|
   |                                   |
```

> **Note**: External file changes (e.g., IDE edits) are detected via **Vite HMR**, not WebSocket.
> The browser listens to `import.meta.hot` events and clears pending edits when files change.
> This avoids race conditions between HMR DOM updates and WebSocket broadcasts.

### 1.2 Message Base Types

All WebSocket message types are validated at runtime using Zod schemas:

```typescript
// Import types from shared schemas package
import {
  WSClientMessage,
  WSServerMessage,
  WSClientMessageSchema,
  WSServerMessageSchema,
} from '@alara/core/shared';

// Validate incoming message
const message = WSClientMessageSchema.parse(JSON.parse(rawMessage));

// Type is automatically inferred
// message: WSClientMessage
```

```typescript
/**
 * Base interface for all WebSocket messages
 */
interface WSMessage {
  type: string;
  timestamp?: number;
}

/**
 * Client → Server messages (requests)
 */
interface WSClientMessage extends WSMessage {
  action: ClientAction;
  id: string;  // Request ID for correlation
}

/**
 * Server → Client messages (responses/events)
 */
interface WSServerMessage extends WSMessage {
  requestId?: string;  // Correlates to client request ID
}

type ClientAction =
  | 'transform'
  | 'get-variants'
  | 'get-project'
  | 'preview'
  | 'ping';

type ServerMessageType =
  | 'connected'
  | 'transform-result'
  | 'variants'
  | 'project'
  | 'preview-result'
  | 'error'
  | 'pong';

// NOTE: External changes are NOT sent via WebSocket.
// Browser detects file changes via Vite HMR (import.meta.hot).
```

### 1.3 Client → Server Messages

#### Transform Request

Requests a code transformation (CSS update, text edit, variant creation).

```typescript
interface TransformRequest extends WSClientMessage {
  action: 'transform';
  id: string;
  type: TransformType;
  target: ElementTarget;
  change: TransformChange;
}

type TransformType =
  | 'css-update'        // Update CSS property value
  | 'css-add'           // Add new CSS property
  | 'css-remove'        // Remove CSS property
  | 'text-update'       // Update JSX text content
  | 'add-variant'       // Create new variant class
  | 'apply-variant'     // Add variant to element's className
  | 'remove-variant';   // Remove variant from className

/**
 * ElementTarget identifies an element for editing.
 * Data is extracted directly from DOM attributes injected at build time.
 *
 * DOM attributes:
 *   oid="src/components/Button.tsx:12:4"     → file, lineNumber, column
 *   css="src/components/Button.module.css:.button .primary" → cssFile, selectors
 *
 * No registry needed - attributes are self-contained.
 */
interface ElementTarget {
  file: string;           // TSX file path: 'src/components/Button/Button.tsx'
  lineNumber: number;     // 1-indexed line number
  column: number;         // 1-indexed column number
  cssFile: string;        // CSS Module path: 'src/components/Button/Button.module.css'
  selectors: string[];    // CSS selectors: ['.button', '.primary']
}

/**
 * NOTE: Alara only supports editing CSS Module styles.
 * Global styles, inherited styles, and inline styles are NOT editable.
 * The cssFile and selectors are resolved at build time by tracing:
 *   className={`${styles.button} ${styles.primary}`}
 *   → import styles from './Button.module.css'
 *   → cssFile + selectors
 */

type TransformChange =
  | CSSUpdateChange
  | CSSAddChange
  | CSSRemoveChange
  | TextUpdateChange
  | AddVariantChange
  | ApplyVariantChange
  | RemoveVariantChange;

/**
 * CSS change types use StyleValue for type-safe values.
 * See 04-DATA-DESIGN.md for StyleValue discriminated union definition.
 *
 * The client sends computed styles from getComputedStyle() along with
 * the desired change. The server resolves where to make the edit.
 */
interface CSSUpdateChange {
  property: string;           // CSS property: 'padding'
  computedValue: StyleValue;  // Current value from getComputedStyle()
  newValue: StyleValue;       // Desired value: { type: 'unit', value: 16, unit: 'px' }
}

interface CSSAddChange {
  property: string;
  computedValue: StyleValue | null;  // null if property not currently set
  newValue: StyleValue;
}

interface CSSRemoveChange {
  property: string;
  computedValue: StyleValue;  // Current value being removed
}

interface TextUpdateChange {
  originalText: string;
  newText: string;
}

interface AddVariantChange {
  variantName: string;                    // 'large'
  cssFile: string;                        // 'src/components/Button/Button.module.css'
  styles: Record<string, StyleValue>;     // { padding: { type: 'tuple', value: [...] } }
}

interface ApplyVariantChange {
  variantName: string;
}

interface RemoveVariantChange {
  variantName: string;
}
```

**Example Messages**:

```json
// CSS Update - client sends computed value + desired new value
{
  "action": "transform",
  "id": "req-001",
  "type": "css-update",
  "target": {
    "file": "src/components/Button/Button.tsx",
    "lineNumber": 12,
    "column": 4,
    "cssFile": "src/components/Button/Button.module.css",
    "selector": ".button"
  },
  "change": {
    "property": "padding",
    "computedValue": { "type": "unit", "value": 12, "unit": "px" },
    "newValue": { "type": "unit", "value": 16, "unit": "px" }
  }
}

// Add Variant with typed values
{
  "action": "transform",
  "id": "req-002",
  "type": "add-variant",
  "target": {
    "file": "src/components/Button/Button.tsx",
    "lineNumber": 12,
    "column": 4,
    "selector": ".button"
  },
  "change": {
    "variantName": "large",
    "cssFile": "src/components/Button/Button.module.css",
    "styles": {
      "padding": {
        "type": "tuple",
        "value": [
          { "type": "unit", "value": 20, "unit": "px" },
          { "type": "unit", "value": 32, "unit": "px" }
        ]
      },
      "font-size": { "type": "unit", "value": 18, "unit": "px" }
    }
  }
}
```

#### Get Variants Request

Fetches available variants for a component.

```typescript
interface GetVariantsRequest extends WSClientMessage {
  action: 'get-variants';
  id: string;
  cssFile: string;  // 'src/components/Button/Button.module.css'
}
```

#### Get Project Request

Fetches project metadata. Typically called once after connection.

```typescript
interface GetProjectRequest extends WSClientMessage {
  action: 'get-project';
  id: string;
}
```

#### Preview Request

Generates a preview of a transform without applying it.

```typescript
interface PreviewRequest extends WSClientMessage {
  action: 'preview';
  id: string;
  type: TransformType;
  target: ElementTarget;
  change: TransformChange;
}
```

**Example**:

```json
{
  "action": "preview",
  "id": "req-preview-001",
  "type": "css-update",
  "target": {
    "file": "src/components/Button/Button.tsx",
    "lineNumber": 12,
    "column": 4,
    "cssFile": "src/components/Button/Button.module.css",
    "selector": ".button"
  },
  "change": {
    "property": "padding",
    "computedValue": { "type": "unit", "value": 12, "unit": "px" },
    "newValue": { "type": "unit", "value": 24, "unit": "px" }
  }
}
```

#### Ping Request

Keep-alive heartbeat.

```typescript
interface PingRequest extends WSClientMessage {
  action: 'ping';
  id: string;
}
```

### 1.4 Server → Client Messages

#### Connected

Sent immediately after WebSocket connection established.

```typescript
interface ConnectedMessage extends WSServerMessage {
  type: 'connected';
  clientId: string;
  serverVersion: string;
  projectDir: string;
}
```

```json
{
  "type": "connected",
  "clientId": "client-abc123",
  "serverVersion": "0.1.0",
  "projectDir": "/Users/dev/my-project"
}
```

#### Transform Result

Response to a transform request.

```typescript
interface TransformResultMessage extends WSServerMessage {
  type: 'transform-result';
  requestId: string;
  success: boolean;
  error?: TransformError;
  affectedFiles?: string[];  // Files modified by this transform
}

interface TransformError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
```

```json
// Success
{
  "type": "transform-result",
  "requestId": "req-001",
  "success": true,
  "affectedFiles": ["src/components/Button/Button.module.css"]
}

// Failure
{
  "type": "transform-result",
  "requestId": "req-001",
  "success": false,
  "error": {
    "code": "SELECTOR_NOT_FOUND",
    "message": "Selector '.button' not found in Button.module.css",
    "details": {
      "file": "src/components/Button/Button.module.css",
      "selector": ".button"
    }
  }
}
```

#### Variants Response

Response to get-variants request.

```typescript
interface VariantsMessage extends WSServerMessage {
  type: 'variants';
  requestId: string;
  baseClass: string;           // 'button'
  variants: VariantInfo[];
}

interface VariantInfo {
  name: string;                // 'large'
  selector: string;            // '.large'
  lineNumber: number;          // Line in CSS file
  properties: VariantProperty[]; // Styles in this variant
}

interface VariantProperty {
  property: string;       // CSS property name
  value: StyleValue;      // Typed CSS value
  rawValue: string;       // Original string from CSS file
  lineNumber: number;     // Line in CSS file
}
```

```json
{
  "type": "variants",
  "requestId": "req-004",
  "baseClass": "button",
  "variants": [
    {
      "name": "large",
      "selector": ".large",
      "lineNumber": 15,
      "properties": [
        {
          "property": "padding",
          "value": {
            "type": "tuple",
            "value": [
              { "type": "unit", "value": 16, "unit": "px" },
              { "type": "unit", "value": 32, "unit": "px" }
            ]
          },
          "rawValue": "16px 32px",
          "lineNumber": 16
        },
        {
          "property": "font-size",
          "value": { "type": "unit", "value": 18, "unit": "px" },
          "rawValue": "18px",
          "lineNumber": 17
        }
      ]
    },
    {
      "name": "compact",
      "selector": ".compact",
      "lineNumber": 20,
      "properties": [
        {
          "property": "padding",
          "value": {
            "type": "tuple",
            "value": [
              { "type": "unit", "value": 8, "unit": "px" },
              { "type": "unit", "value": 16, "unit": "px" }
            ]
          },
          "rawValue": "8px 16px",
          "lineNumber": 21
        }
      ]
    }
  ]
}
```

#### Project Response

Response to get-project request.

```typescript
interface ProjectMessage extends WSServerMessage {
  type: 'project';
  requestId: string;
  name: string;
  root: string;
  srcDir: string;
  hasViteConfig: boolean;
  hasAlaraConfig: boolean;
  components: ComponentInfo[];
}

interface ComponentInfo {
  name: string;
  path: string;       // 'src/components/Button/Button.tsx'
  cssModule: string;  // 'src/components/Button/Button.module.css'
}
```

```json
{
  "type": "project",
  "requestId": "req-project-001",
  "name": "my-app",
  "root": "/Users/dev/my-project",
  "srcDir": "src",
  "hasViteConfig": true,
  "hasAlaraConfig": true,
  "components": [
    {
      "name": "Button",
      "path": "src/components/Button/Button.tsx",
      "cssModule": "src/components/Button/Button.module.css"
    },
    {
      "name": "Card",
      "path": "src/components/Card/Card.tsx",
      "cssModule": "src/components/Card/Card.module.css"
    }
  ]
}
```

#### Preview Result

Response to preview request. Shows what would change without applying.

```typescript
interface PreviewResultMessage extends WSServerMessage {
  type: 'preview-result';
  requestId: string;
  valid: boolean;
  preview: FilePreview[];
  warnings?: string[];
}

interface FilePreview {
  file: string;
  before: string;  // Lines around the change (with context)
  after: string;   // Lines after the change would be applied
  lineNumber: number;  // Starting line of the change
}
```

```json
{
  "type": "preview-result",
  "requestId": "req-preview-001",
  "valid": true,
  "preview": [
    {
      "file": "src/components/Button/Button.module.css",
      "before": ".button {\n  padding: 12px 24px;\n  background: blue;\n}",
      "after": ".button {\n  padding: 24px;\n  background: blue;\n}",
      "lineNumber": 5
    }
  ],
  "warnings": []
}
```

#### External Change Detection (via Vite HMR)

External file changes (IDE edits, git operations) are detected via **Vite HMR**, not WebSocket messages.

```typescript
// builder/hooks/useViteHMR.ts
// Listen for Vite HMR events to detect external file changes

import type { UpdatePayload } from 'vite/types/hmrPayload';

export function useViteHMR() {
  const clearPendingEdits = useEditorStore(s => s.clearPendingEditsForFile);
  const clearUndoRedo = useEditorStore(s => s.clearUndoRedoForFile);
  const refreshSelectedElement = useEditorStore(s => s.refreshSelectedElement);

  useEffect(() => {
    if (!import.meta.hot) return;

    // Vite HMR broadcasts when files change
    // Payload type: { type: 'update', updates: Update[] }
    // Each update has: { type, path, acceptedPath, timestamp }
    import.meta.hot.on('vite:beforeUpdate', (payload: UpdatePayload) => {
      for (const update of payload.updates) {
        // update.path is URL-style: '/src/Button.module.css'
        // Normalize to project-relative path: 'src/Button.module.css'
        const file = update.path.replace(/^\//, '');

        // Clear pending edits for changed file
        clearPendingEdits(file);

        // Clear undo/redo for changed file (external edit invalidates history)
        clearUndoRedo(file);
      }

      // Refresh selected element styles after HMR updates DOM
      refreshSelectedElement();
    });
  }, [clearPendingEdits, clearUndoRedo, refreshSelectedElement]);
}
```

**Why Vite HMR instead of WebSocket?**
- Vite HMR and WebSocket would race - no guaranteed order
- HMR updates DOM with new `oid` and `css` attributes
- Single source of truth eliminates sync issues

#### Error Message

General error not tied to a specific request.

```typescript
interface ErrorMessage extends WSServerMessage {
  type: 'error';
  error: TransformError;
}
```

#### Pong

Response to ping request.

```typescript
interface PongMessage extends WSServerMessage {
  type: 'pong';
  requestId: string;
  serverTime: number;
}
```

---

## 2. HTTP Endpoint (Infrastructure Only)

Alara uses a **WebSocket-only architecture** for all **application operations** (transforms, styles, variants, etc.). This provides:
- Single protocol to maintain and test
- Consistent error handling
- Simpler plugin code (one connection)
- Clear extension point (add new message types)

The only HTTP endpoint is for **infrastructure health checks** (used by monitoring tools). This is NOT part of the application protocol:

### GET /api/health

```
http://localhost:4000/api/health
```

```typescript
interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  uptime: number;  // seconds
  projectDir: string;
}
```

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 3600,
  "projectDir": "/Users/dev/my-project"
}
```

> **Note**: All other operations (`get-project`, `get-variants`, `preview`, `transform`)
> are handled via WebSocket messages. See [Section 1](#1-websocket-protocol) for message formats.

---

## 3. Core Type Definitions

Shared types used across all packages. All types are derived from Zod schemas for runtime validation.

```typescript
// All core types are exported from the shared package
import {
  ElementTarget,
  ElementTargetSchema,
  CSSUnit,
  CSSUnitSchema,
  BoxSides,
  BoxSidesSchema,
  ColorValue,
  ColorValueSchema,
} from '@alara/core/shared';
```

### 3.1 Element Identification

Elements are identified using two **self-contained DOM attributes** injected at build time:

| Attribute | Format | Example |
|-----------|--------|---------|
| `oid` | `{file}:{line}:{col}` | `src/components/Button.tsx:12:4` |
| `css` | `{cssFile}:{selectors}` | `src/components/Button.module.css:.button .primary` |

**No registry needed** - all metadata is encoded directly in the attributes.

```typescript
// schemas/element.ts
import { z } from 'zod';

export const ElementTargetSchema = z.object({
  file: z.string().min(1).regex(/\.(tsx?|jsx?)$/, 'Must be a TypeScript/JavaScript file'),
  lineNumber: z.number().int().positive(),
  column: z.number().int().positive(),
  cssFile: z.string().min(1).regex(/\.module\.css$/, 'Must be a CSS Module file'),
  selectors: z.array(z.string().min(1).startsWith('.')).min(1),
});

// TypeScript type is inferred from schema
export type ElementTarget = z.infer<typeof ElementTargetSchema>;

/**
 * ElementTarget identifies an element in source code.
 *
 * @property file - Relative file path from project root
 * @property lineNumber - 1-indexed line number where element starts
 * @property column - 1-indexed column number
 * @property cssFile - CSS Module file path
 * @property selectors - CSS Module selectors (e.g., ['.button', '.primary'])
 */

/**
 * Extract ElementTarget from a DOM element by parsing oid + css attributes.
 */
function getElementTarget(element: HTMLElement): ElementTarget | null {
  const oid = element.getAttribute('oid');
  const css = element.getAttribute('css');

  if (!oid || !css) {
    // Walk up the DOM tree to find nearest element with both attributes
    const parent = element.closest('[oid][css]') as HTMLElement | null;
    if (!parent) return null;
    return getElementTarget(parent);
  }

  // Parse oid: "src/components/Button.tsx:12:4"
  const oidParts = oid.split(':');
  const column = parseInt(oidParts.pop()!, 10);
  const lineNumber = parseInt(oidParts.pop()!, 10);
  const file = oidParts.join(':'); // Handle Windows paths with drive letters

  // Parse css: "src/components/Button.module.css:.button .primary"
  const cssColonIndex = css.indexOf(':.');
  if (cssColonIndex === -1) {
    console.warn(`[Alara] Invalid css attribute format: ${css}`);
    return null;
  }
  const cssFile = css.slice(0, cssColonIndex);
  const selectorsStr = css.slice(cssColonIndex + 1); // includes leading dot
  const selectors = selectorsStr.split(' ').filter(s => s.startsWith('.'));

  return { file, lineNumber, column, cssFile, selectors };
}
```

### 3.2 Typed CSS Value System (Type Registry Pattern)

CSS values use the **Type Registry Pattern** - an extensible discriminated union where new value types can be added via TypeScript module augmentation.

**Benefits**:
- **Extensible**: Add new value types without modifying core code
- **Type-safe**: Full TypeScript inference for all value types
- **Validation**: Zod schemas for runtime validation
- **Smart UI**: Property editors can render based on value type

See [04-DATA-DESIGN.md](./04-DATA-DESIGN.md#4-typed-css-value-system) for Zod schema definitions.

```typescript
// packages/core/src/shared/css-values.ts

/**
 * TYPE REGISTRY - Open interface for extending StyleValue types.
 *
 * To add a new value type:
 * 1. Add to this interface
 * 2. Create the type definition
 * 3. Add Zod schema to StyleValueSchema union
 * 4. Add parser to parseCssValue()
 */
export interface StyleValueTypeRegistry {
  unit: UnitValue;
  number: NumberValue;
  keyword: KeywordValue;
  color: ColorValue;
  var: VarValue;
  tuple: TupleValue;
  shadow: ShadowValue;
  // ─────────────────────────────────────────────────────────────
  // TO ADD A NEW VALUE TYPE:
  // gradient: GradientValue;   // Add here
  // ─────────────────────────────────────────────────────────────
}

/**
 * StyleValue is the union of all registered types.
 * Automatically updates when new types are added to the registry.
 */
export type StyleValue = StyleValueTypeRegistry[keyof StyleValueTypeRegistry];

/**
 * Type guard for checking value type at runtime.
 */
export function isValueType<T extends keyof StyleValueTypeRegistry>(
  value: StyleValue,
  type: T
): value is StyleValueTypeRegistry[T] {
  return value.type === type;
}

// ─────────────────────────────────────────────────────────────
// EXTENDING VIA MODULE AUGMENTATION (from another package)
// ─────────────────────────────────────────────────────────────
//
// // In your package:
// declare module '@alara/core/shared' {
//   interface StyleValueTypeRegistry {
//     gradient: GradientValue;
//   }
// }
//
// // Then register the parser and schema:
// valueParserRegistry.register('gradient', parseGradient);
// ─────────────────────────────────────────────────────────────
```

**Usage**:
```typescript
import { StyleValue, parseCssValue, toValue, isValueType } from '@alara/core/shared';

// Parse CSS string to typed value
const value = parseCssValue('padding', '16px');
// Returns: { type: 'unit', value: 16, unit: 'px' }

// Convert typed value back to CSS string
const cssString = toValue(value);
// Returns: '16px'

// Type guard for specific value types
if (isValueType(value, 'unit')) {
  console.log(value.value, value.unit);  // TypeScript knows the shape
}
```

**Built-in Value Types**:

| Type | Example Value | Use Case |
|------|--------------|----------|
| `UnitValue` | `{ type: 'unit', value: 16, unit: 'px' }` | Dimensions, font-size |
| `NumberValue` | `{ type: 'number', value: 1.5 }` | line-height, opacity |
| `KeywordValue` | `{ type: 'keyword', value: 'auto' }` | auto, inherit, none |
| `ColorValue` | `{ type: 'color', colorSpace: 'srgb', ... }` | All color properties |
| `VarValue` | `{ type: 'var', name: 'spacing-md' }` | CSS custom properties |
| `TupleValue` | `{ type: 'tuple', value: [...] }` | padding, margin shorthand |
| `ShadowValue` | `{ type: 'shadow', offsetX: ..., ... }` | box-shadow, text-shadow |

**Extending the Type Registry** (complete example):

To add a new value type (e.g., CSS gradients), create a new file and use module augmentation:

```typescript
// my-plugin/src/gradient-value.ts
import { z } from 'zod';

// 1. Define the value interface
export interface GradientValue {
  type: 'gradient';
  gradientType: 'linear' | 'radial';
  angle?: number;
  stops: Array<{ color: string; position: string }>;
}

// 2. Define the Zod schema for runtime validation
export const GradientValueSchema = z.object({
  type: z.literal('gradient'),
  gradientType: z.enum(['linear', 'radial']),
  angle: z.number().optional(),
  stops: z.array(z.object({
    color: z.string(),
    position: z.string(),
  })),
});

// 3. Augment the type registry (TypeScript module augmentation)
declare module '@alara/core/shared' {
  interface StyleValueTypeRegistry {
    gradient: GradientValue;
  }
}

// 4. Create parser function
export function parseGradient(value: string): GradientValue | null {
  const linearMatch = value.match(/^linear-gradient\((\d+)deg,\s*(.+)\)$/);
  if (linearMatch) {
    const angle = parseInt(linearMatch[1], 10);
    const stopsStr = linearMatch[2];
    const stops = stopsStr.split(',').map(s => {
      const [color, position] = s.trim().split(/\s+/);
      return { color, position: position || '0%' };
    });
    return { type: 'gradient', gradientType: 'linear', angle, stops };
  }
  return null;
}

// 5. Create serializer function
export function gradientToValue(g: GradientValue): string {
  const stopsStr = g.stops.map(s => `${s.color} ${s.position}`).join(', ');
  if (g.gradientType === 'linear') {
    return `linear-gradient(${g.angle ?? 180}deg, ${stopsStr})`;
  }
  return `radial-gradient(${stopsStr})`;
}

// 6. Register with the value parser registry
import { valueParserRegistry, valueSerializerRegistry } from '@alara/core/shared';

valueParserRegistry.register('gradient', parseGradient);
valueSerializerRegistry.register('gradient', gradientToValue);
```

After registration, gradients work like any other `StyleValue`:

```typescript
import { parseCssValue, toValue } from '@alara/core/shared';

const gradient = parseCssValue('background', 'linear-gradient(45deg, red 0%, blue 100%)');
// Returns: { type: 'gradient', gradientType: 'linear', angle: 45, stops: [...] }

const css = toValue(gradient);
// Returns: 'linear-gradient(45deg, red 0%, blue 100%)'
```

### 3.3 Box Model Types

```typescript
/**
 * Four-sided box model values (margin, padding, border-width).
 */
interface BoxSides {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/**
 * Four-cornered values (border-radius).
 */
interface BoxCorners {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
}

/**
 * Parse CSS shorthand into BoxSides.
 * Handles: 1 value, 2 values (v h), 3 values (t h b), 4 values (t r b l)
 */
function parseBoxShorthand(value: string): BoxSides {
  const parts = value.split(/\s+/);
  switch (parts.length) {
    case 1:
      return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    case 2:
      return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    case 3:
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    case 4:
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    default:
      return { top: '0', right: '0', bottom: '0', left: '0' };
  }
}
```

### 3.4 Color Types

Colors use the `ColorValue` type from the Typed CSS Value System, which stores colors in a color-space-aware format using `colorjs.io` for parsing.

```typescript
import { ColorValue, parseColor, colorToString } from '@alara/core/shared';

/**
 * ColorValue represents colors in any color space.
 * See 04-DATA-DESIGN.md for full schema definition.
 */
interface ColorValue {
  type: 'color';
  colorSpace: 'srgb' | 'display-p3' | 'oklch' | 'oklab' | 'hsl';
  channels: [number, number, number];  // Normalized values for the color space
  alpha: number;                       // 0-1
}

// Parse any color format
const color = parseColor('#1a73e8');
// Returns: { type: 'color', colorSpace: 'srgb', channels: [0.102, 0.451, 0.910], alpha: 1 }

// Convert to CSS string (preserves original format when possible)
const cssString = colorToString(color, 'hex');
// Returns: '#1a73e8'

// Convert between color spaces
const oklch = convertColorSpace(color, 'oklch');
// Returns: { type: 'color', colorSpace: 'oklch', channels: [...], alpha: 1 }
```

**Supported color formats:**
- Hex: `#rgb`, `#rrggbb`, `#rrggbbaa`
- RGB: `rgb(r, g, b)`, `rgba(r, g, b, a)`
- HSL: `hsl(h, s%, l%)`, `hsla(h, s%, l%, a)`
- OKLCH: `oklch(l c h)` - perceptually uniform
- Named colors: `red`, `blue`, `transparent`, etc.
- CSS variables: `var(--color-primary)` → `VarValue` type

---

## 4. Transform Request/Response Types

Complete type definitions for transform operations.

### 4.1 Request Types

```typescript
/**
 * Union of all transform request types.
 */
type TransformRequest =
  | CSSUpdateRequest
  | CSSAddRequest
  | CSSRemoveRequest
  | TextUpdateRequest
  | AddVariantRequest
  | ApplyVariantRequest
  | RemoveVariantRequest;

interface BaseTransformRequest {
  id: string;
  type: TransformType;
  target: ElementTarget;
}

interface CSSUpdateRequest extends BaseTransformRequest {
  type: 'css-update';
  change: {
    property: string;
    value: StyleValue;  // Typed CSS value
  };
}

interface CSSAddRequest extends BaseTransformRequest {
  type: 'css-add';
  change: {
    property: string;
    value: StyleValue;  // Typed CSS value
    position?: 'first' | 'last' | { after: string };
  };
}

interface CSSRemoveRequest extends BaseTransformRequest {
  type: 'css-remove';
  change: {
    property: string;
  };
}

interface TextUpdateRequest extends BaseTransformRequest {
  type: 'text-update';
  change: {
    originalText: string;
    newText: string;
  };
}

interface AddVariantRequest extends BaseTransformRequest {
  type: 'add-variant';
  change: {
    variantName: string;
    cssFile: string;
    styles: Record<string, StyleValue>;  // Typed CSS values
  };
}

interface ApplyVariantRequest extends BaseTransformRequest {
  type: 'apply-variant';
  change: {
    variantName: string;
  };
}

interface RemoveVariantRequest extends BaseTransformRequest {
  type: 'remove-variant';
  change: {
    variantName: string;
  };
}
```

### 4.2 Response Types

```typescript
/**
 * Result of a transform operation.
 */
interface TransformResult {
  success: boolean;
  requestId: string;

  /** Files that were modified */
  affectedFiles?: string[];

  /** Error details if success is false */
  error?: TransformError;

  /** Undo information for command pattern */
  undoData?: UndoData;
}

interface UndoData {
  type: TransformType;
  target: ElementTarget;
  revertChange: TransformChange;  // Change to apply for undo
}

interface TransformError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
```

---

## 5. Store Interfaces

TypeScript interfaces for Zustand store.

### 5.1 Editor Store State

```typescript
interface EditorState {
  // === Connection ===
  wsConnected: boolean;
  wsClient: WebSocket | null;
  serverVersion: string | null;

  // === Selection ===
  selectedElement: SelectedElement | null;
  hoveredElement: HoveredElement | null;

  // === Text Editing ===
  isTextEditing: boolean;
  textEditingTarget: ElementTarget | null;
  textEditingOriginal: string | null;

  // === Pending Operations ===
  pendingEdits: Map<string, PendingEdit>;

  // === Undo/Redo ===
  undoStack: Command[];
  redoStack: Command[];
  maxStackSize: number;

  // === UI State ===
  activeToolboxTab: ToolboxTabId | null;  // Which tab is active in FloatingToolbox
  deviceMode: DeviceMode;
  zoom: number;
  previewMode: boolean;

  // === Cached Data ===
  componentVariants: Map<string, VariantInfo[]>;  // Keyed by CSS file
}

interface SelectedElement {
  target: ElementTarget;
  domElement: HTMLElement;
  bounds: DOMRect;
  // Computed styles are read directly from DOM via getComputedStyle()
  // No need to store them - they're always fresh from the browser
}

interface HoveredElement {
  target: ElementTarget;
  bounds: DOMRect;
}

interface PendingEdit {
  id: string;
  target: ElementTarget;
  type: TransformType;
  change: TransformChange;
  status: 'pending' | 'committed' | 'failed';
  error?: string;
  timestamp: number;
}

type DeviceMode = 'desktop' | 'tablet' | 'mobile';
```

### 5.2 Command Types (Undo/Redo)

```typescript
interface Command {
  id: string;
  type: CommandType;
  target: ElementTarget;
  before: unknown;
  after: unknown;
  timestamp: number;
}

/**
 * CommandType uses kebab-case to match TransformType convention.
 * Maps 1:1 with TransformType for consistency.
 */
type CommandType =
  | 'update-style'
  | 'add-style'
  | 'remove-style'
  | 'update-text'
  | 'add-variant'
  | 'apply-variant'
  | 'remove-variant';

interface StyleCommand extends Command {
  type: 'update-style' | 'add-style' | 'remove-style';
  before: { property: string; value: StyleValue | null };
  after: { property: string; value: StyleValue | null };
}

interface TextCommand extends Command {
  type: 'update-text';
  before: string;
  after: string;
}

interface VariantCommand extends Command {
  type: 'add-variant' | 'apply-variant' | 'remove-variant';
  before: { className: string; variants: string[] };
  after: { className: string; variants: string[] };
}
```

### 5.3 Editor Store Actions

```typescript
interface EditorActions {
  // === Connection ===
  connect: (url: string) => Promise<void>;
  disconnect: () => void;

  // === Selection ===
  selectElement: (element: HTMLElement, target: ElementTarget) => void;
  hoverElement: (target: ElementTarget, bounds: DOMRect) => void;
  clearHover: () => void;
  clearSelection: () => void;
  selectParent: () => void;
  selectNextSibling: () => void;
  selectPrevSibling: () => void;

  // === Style Editing ===
  updateStyle: (property: string, value: StyleValue) => void;
  addStyle: (property: string, value: StyleValue) => void;
  removeStyle: (property: string) => void;

  // === Text Editing ===
  startTextEditing: (target: ElementTarget) => void;
  updateTextEditing: (content: string) => void;
  commitTextEdit: () => void;
  cancelTextEditing: () => void;

  // === Variants ===
  createVariant: (name: string, styles: Record<string, StyleValue>) => void;
  applyVariant: (variantName: string) => void;
  removeVariant: (variantName: string) => void;

  // === Undo/Redo ===
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // === UI ===
  setActiveToolboxTab: (tab: ToolboxTabId | null) => void;
  setDeviceMode: (mode: DeviceMode) => void;
  setZoom: (zoom: number) => void;
  togglePreviewMode: () => void;

  // === Internal ===
  // Called by useViteHMR hook when Vite detects file changes
  clearPendingEditsForFile: (file: string) => void;
  clearUndoRedoForFile: (file: string) => void;
  refreshSelectedElement: () => void;

  handleTransformResult: (result: TransformResultMessage) => void;
  fetchVariants: (cssFile: string) => Promise<void>;

  // === Computed Styles (client-side) ===
  // Read directly from DOM, no server round-trip needed
  getComputedStyles: (element: HTMLElement) => CSSStyleDeclaration;
}
```

---

## 6. Component Props Interfaces

React component prop types.

### 6.1 Canvas Components

```typescript
interface CanvasProps {
  children: React.ReactNode;
}

interface SelectionOverlayProps {
  bounds: DOMRect;
  element: HTMLElement;
  onResize?: (width: number, height: number) => void;
}

interface HoverOverlayProps {
  bounds: DOMRect;
}

interface ResizeHandleProps {
  position: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
  onDrag: (dx: number, dy: number) => void;
  onDragEnd: () => void;
}
```

### 6.2 FloatingToolbox Components

```typescript
// Tab identifiers
type ToolboxTabId = 'layout' | 'spacing' | 'colors' | 'typography' | 'border' | 'effects' | 'format';

// Floating UI returns placement after flip middleware runs
type ToolboxPlacement = 'top' | 'bottom';

interface FloatingToolboxProps {
  element: SelectedElement;
  referenceElement: HTMLElement | null;  // Element to anchor to (Floating UI reference)
}

interface TabBarProps {
  tabs: ToolboxTabConfig[];
  activeTab: ToolboxTabId | null;
  onTabChange: (tab: ToolboxTabId) => void;
}

interface ToolboxTabConfig {
  id: ToolboxTabId;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

interface TabContentProps {
  activeTab: ToolboxTabId | null;
  element: SelectedElement;
}

// Panel props (all panels share same interface)
interface PanelProps {
  element: SelectedElement;
}

// Specific panel interfaces
interface LayoutPanelProps extends PanelProps {}
interface SpacingPanelProps extends PanelProps {}
interface ColorsPanelProps extends PanelProps {}
interface TypographyPanelProps extends PanelProps {}
interface BorderPanelProps extends PanelProps {}
interface EffectsPanelProps extends PanelProps {}
interface FormatPanelProps extends PanelProps {}
```

### 6.3 Input Control Components

```typescript
interface ValueInputProps {
  value: StyleValue;
  allowedUnits?: Unit[];  // From UnitValue schema
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: StyleValue) => void;
  onBlur?: () => void;
}

interface ColorPickerProps {
  value: ColorValue;
  outputFormat?: 'hex' | 'rgb' | 'hsl' | 'oklch';
  showAlpha?: boolean;
  onChange: (value: ColorValue) => void;
  onClose?: () => void;
}

interface SelectProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

interface ToggleGroupProps<T extends string> {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
}

interface BoxModelInputProps {
  margin: BoxSides<StyleValue>;
  padding: BoxSides<StyleValue>;
  width: StyleValue;
  height: StyleValue;
  linked: boolean;
  onMarginChange: (sides: BoxSides<StyleValue>) => void;
  onPaddingChange: (sides: BoxSides<StyleValue>) => void;
  onWidthChange: (value: StyleValue) => void;
  onHeightChange: (value: StyleValue) => void;
  onLinkedChange: (linked: boolean) => void;
}

// Generic BoxSides for typed values
interface BoxSides<T> {
  top: T;
  right: T;
  bottom: T;
  left: T;
}
```

### 6.4 Runtime Components

```typescript
/**
 * EditorWrapper provides runtime context for visual editing.
 * The Vite plugin injects `oid` and `css` attributes on JSX elements.
 */
interface EditorWrapperProps {
  /** Wrapped children */
  children: React.ReactNode;
}

/**
 * Attributes injected on every JSX element by the Vite plugin.
 * All metadata is self-contained - no registry lookup needed.
 */
interface AlaraElementAttributes {
  oid: string;  // JSX location: "src/components/Button.tsx:12:4"
  css: string;  // CSS location: "src/components/Button.module.css:.button .primary"
}
```

---

## 7. Error Codes

Standardized error codes for transform operations.

```typescript
type ErrorCode =
  // File errors
  | 'FILE_NOT_FOUND'
  | 'FILE_READ_ERROR'
  | 'FILE_WRITE_ERROR'
  | 'FILE_PARSE_ERROR'

  // CSS errors
  | 'SELECTOR_NOT_FOUND'
  | 'PROPERTY_NOT_FOUND'
  | 'INVALID_CSS_VALUE'
  | 'CSS_SYNTAX_ERROR'
  | 'VARIANT_ALREADY_EXISTS'
  | 'VARIANT_NOT_FOUND'

  // JSX errors
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_MOVED'
  | 'TEXT_NOT_FOUND'
  | 'CLASSNAME_INVALID'
  | 'JSX_SYNTAX_ERROR'

  // Transaction errors
  | 'TRANSACTION_FAILED'
  | 'ROLLBACK_FAILED'

  // Connection errors
  | 'CONNECTION_LOST'
  | 'TIMEOUT'

  // General errors
  | 'UNKNOWN_ERROR';

/**
 * Error code to user-friendly message mapping.
 */
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  FILE_NOT_FOUND: 'The file could not be found',
  FILE_READ_ERROR: 'Failed to read file',
  FILE_WRITE_ERROR: 'Failed to write file',
  FILE_PARSE_ERROR: 'Failed to parse file',
  SELECTOR_NOT_FOUND: 'CSS selector not found in file',
  PROPERTY_NOT_FOUND: 'CSS property not found',
  INVALID_CSS_VALUE: 'Invalid CSS value',
  CSS_SYNTAX_ERROR: 'CSS syntax error',
  VARIANT_ALREADY_EXISTS: 'A variant with this name already exists',
  VARIANT_NOT_FOUND: 'Variant not found',
  ELEMENT_NOT_FOUND: 'Element not found at expected location',
  ELEMENT_MOVED: 'Element has moved, please reselect',
  TEXT_NOT_FOUND: 'Text content not found',
  CLASSNAME_INVALID: 'className attribute has unexpected format',
  JSX_SYNTAX_ERROR: 'JSX syntax error',
  TRANSACTION_FAILED: 'Failed to apply changes',
  ROLLBACK_FAILED: 'Failed to rollback changes',
  CONNECTION_LOST: 'Connection to server lost',
  TIMEOUT: 'Request timed out',
  UNKNOWN_ERROR: 'An unexpected error occurred',
};
```

---

## Usage Examples

### Example: Updating Padding

```typescript
import { parseCssValue, toValue } from '@alara/core/shared';

// 1. User selects an element - client parses oid + css attributes
const target = getElementTarget(selectedElement);
// Returns: {
//   file: 'src/components/Button/Button.tsx',
//   lineNumber: 12,
//   column: 4,
//   cssFile: 'src/components/Button/Button.module.css',
//   selectors: ['.button']
// }

// 2. Client reads current computed value from browser
const computed = getComputedStyle(selectedElement);
const currentPadding = parseCssValue('padding', computed.padding);
// Returns: { type: 'unit', value: 12, unit: 'px' }

// 3. User drags to change padding - client sends transform with both values
const newPadding = parseCssValue('padding', '16px');

const request: TransformRequest = {
  id: 'req-001',
  type: 'css-update',
  target,
  change: {
    property: 'padding',
    computedValue: currentPadding,  // What browser shows now
    newValue: newPadding,           // What user wants
  },
};

wsClient.send(JSON.stringify({ action: 'transform', ...request }));

// 4. Server resolves: "padding: 12px is in .button at Button.module.css:6"
//    Server updates that line to "padding: 16px"

// 5. Server responds
const response: TransformResultMessage = {
  type: 'transform-result',
  requestId: 'req-001',
  success: true,
  affectedFiles: ['src/components/Button/Button.module.css'],
};

// 6. Vite HMR updates CSS, browser re-renders with new value
```

### Example: Creating a Variant

```typescript
import { parseCssValue } from '@alara/core/shared';

// 1. User selects element - parse oid + css attributes
const target = getElementTarget(selectedElement);

// 2. User creates "large" variant with typed styles
const request: AddVariantRequest = {
  id: 'req-002',
  type: 'add-variant',
  target,
  change: {
    variantName: 'large',
    cssFile: target.cssFile,
    styles: {
      'padding': parseCssValue('padding', '20px 32px'),
      'font-size': parseCssValue('font-size', '18px'),
    },
  },
};

wsClient.send(JSON.stringify({ action: 'transform', ...request }));

// 3. Server validates all StyleValues with Zod schemas
// 4. Server converts typed values to CSS strings for file output
// 5. Server creates .large class in CSS Module
// 6. Server updates JSX: className={styles.button} → className={`${styles.button} ${styles.large}`}
// 7. Both files written atomically
// 8. Vite HMR updates both CSS and JSX
```
