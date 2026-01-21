# 01 - High-Level Architecture

## System Overview

Alara Builder is a standalone Bun-based service that provides visual editing capabilities for React projects. It operates as a separate process that connects to the user's Vite dev server via WebSocket, enabling real-time bidirectional sync between the visual editor and source code.

## Package Structure

Monorepo using pnpm workspaces with **packages/** for all libraries.
This structure follows the **Open/Closed Principle**: add new features by adding files, not modifying existing ones.

### Project Structure

```
alara/
├── pnpm-workspace.yaml               # Workspace configuration
├── turbo.json                        # Build orchestration (parallel builds, caching)
├── tsconfig.base.json                # Shared TypeScript config
│
├── packages/
│   ├── client/                       # ⬅ CLIENT-SIDE EDITOR UI (Vanilla JS/TS)
│   │   ├── src/                      #   Injected into user's app via Vite plugin
│   │   │   ├── index.ts              #   initAlaraClient() entry point
│   │   │   ├── store.ts              #   Vanilla Zustand store (no React)
│   │   │   ├── selection.ts          #   Click/hover event handlers
│   │   │   ├── text-editing.ts       #   Keyboard/blur handlers for text edit
│   │   │   ├── overlays.ts           #   DOM-based overlay rendering
│   │   │   ├── websocket.ts          #   WS connection with reconnect/error handling
│   │   │   └── behaviors/            #   ⬅ EDITOR BEHAVIORS
│   │   │       ├── registry.ts       #     EditorBehaviorsRegistry defined here
│   │   │       └── handlers/         #     Add new behaviors here
│   │   │           └── text-edit.ts  #     Double-click text → inline editing
│   │   └── package.json
│   │
│   ├── core/                         
│   │   ├── src/
│   │   │   ├── __tests__/            
│   │   │   │   ├── css-values.test.ts
│   │   │   │   ├── parser.test.ts
│   │   │   │   └── ...
│   │   │   │
│   │   │   ├── shared/               # ═══ SHARED CONTRACTS  ═══
│   │   │   │   ├── css-values.ts     # StyleValue types + Zod schemas + parsers
│   │   │   │   ├── messages.ts       # WebSocket message types + schemas
│   │   │   │   ├── transforms.ts     # Transform request/response types
│   │   │   │   ├── elements.ts       # ElementTarget, shared element types
│   │   │   │   └── index.ts          # Public exports: import from '@alara/core/shared'
│   │   │   │
│   │   │   ├── transforms/           # Transform types colocated with handlers
│   │   │   │   ├── registry.ts       # TransformHandler interface defined here
│   │   │   │   ├── registry.test.ts  # ⬅ Registry tests
│   │   │   │   └── handlers/         # ⬅ BUSINESS LOGIC: Pure AST manipulation (CSS/JSX)
│   │   │   │       ├── index.ts      #   Framework-agnostic, no HTTP knowledge
│   │   │   │       ├── css-update.ts #   Defines WHAT transforms do
│   │   │   │       ├── css-update.test.ts  # ⬅ Handler tests colocated
│   │   │   │       ├── css-add.ts
│   │   │   │       ├── text-update.ts
│   │   │   │       └── ...
│   │   │   │
│   │   │   ├── css/                  # CSS types colocated with utilities
│   │   │   │   ├── parser.ts         # Parser + internal types
│   │   │   │   └── values/           # Value parsers (use shared/css-values.ts)
│   │   │   │
│   │   │   └── jsx/
│   │   │       └── ast.ts            # JSX utilities + internal types
│   │   │
│   │   └── package.json
│   │
│   ├── service/                      # Bun backend server
│   │   ├── src/
│   │   │   ├── __tests__/            # ⬅ UNIT & INTEGRATION TESTS
│   │   │   │   ├── integration.test.ts
│   │   │   │   ├── transform-flow.test.ts
│   │   │   │   ├── ws-protocol.test.ts
│   │   │   │   ├── fixtures/         #   CSS/JSX fixture files
│   │   │   │   │   ├── css/
│   │   │   │   │   └── jsx/
│   │   │   │   └── mocks/            #   WebSocket, filesystem mocks
│   │   │   │
│   │   │   ├── server.ts
│   │   │   ├── api/
│   │   │   │   ├── router.ts         # Route types colocated
│   │   │   │   └── handlers/         # ⬅ HTTP ROUTING: Request/response handling
│   │   │   │       ├── transform.ts  #   Validates input, calls core handlers, formats responses
│   │   │   │       ├── transform.test.ts  # ⬅ Handler tests colocated
│   │   │   │       ├── preview.ts    #   Defines HOW service exposes functionality
│   │   │   │       └── ...
│   │   │   ├── ws/
│   │   │   │   └── handler.ts        # Uses shared/messages.ts
│   │   │   ├── engine/
│   │   │   │   └── TransformEngine.ts
│   │   │   ├── watcher/
│   │   │   │   └── FileWatcher.ts
│   │   │   └── static/
│   │   └── package.json
│   │
│   ├── buildtime/                    # Vite/Babel plugins for user's app
│   │   ├── src/
│   │   │   ├── vite-plugin.ts        # Vite plugin entry point (injects @alara/client)
│   │   │   └── babel-plugin-oid.ts   # ⬅ Injects oid attributes for element identification
│   │   └── package.json              # Depends on @alara/client
│   │
│   └── tooling/                      # Shared tooling configs (not types)
│       ├── tsconfig/
│       │   └── base.json
│       └── eslint/
│           └── preset.js
│
├── cli/                              # CLI entry point (bunx alara)
│   ├── src/
│   │   ├── index.ts
│   │   └── commands/
│   │       ├── dev.ts
│   │       ├── build.ts
│   │       └── init.ts
│   └── package.json
│
└── e2e/                              # ⬅ END-TO-END TESTS (Playwright)
    ├── fixtures/
    │   └── test-project/             #   Sample React project for tests
    │       ├── src/components/
    │       ├── package.json
    │       └── vite.config.ts
    ├── visual-editing.spec.ts        #   Selection, hover, property editing
    ├── undo-redo.spec.ts             #   Undo/redo workflows
    ├── variant-creation.spec.ts      #   Creating CSS variants
    └── external-changes.spec.ts      #   File changes via IDE/git
```

### Package Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────┐
│                   User's Vite App (dev mode)                         │
│  Uses: @alara/buildtime (vite plugin)                                │
└───────────────────────────┬──────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  packages/buildtime     │
              │  (Vite plugin)          │
              └───────────┬─────────────┘
                          │ injects at runtime
                          ▼
              ┌─────────────────────────┐
              │  packages/client        │  ← Vanilla JS, runs in browser
              │  - selection handlers   │
              │  - overlay rendering    │
              │  - text editing         │
              │  - WS connection        │
              └───────────┬─────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
  ┌─────────────────────┐   ┌─────────────────────┐
  │  packages/core      │   │  packages/service   │
  │  - shared types     │   │  - Bun server       │
  │  - css-values.ts    │   │  - WS handler       │
  │  - elements.ts      │   │  - transforms       │
  └─────────────────────┘   └─────────────────────┘
```

### Type Location Guide

| Type Category | Location | Import Path |
|---------------|----------|-------------|
| **StyleValue, ColorValue** | `core/src/shared/css-values.ts` | `@alara/core/shared` |
| **WebSocket messages** | `core/src/shared/messages.ts` | `@alara/core/shared` |
| **Transform requests** | `core/src/shared/transforms.ts` | `@alara/core/shared` |
| **ElementTarget** | `core/src/shared/elements.ts` | `@alara/core/shared` |
| **TransformHandler** | `core/src/transforms/registry.ts` | `@alara/core/transforms` |
| **Component props** | Colocated with component | Local import |
| **Store slice types** | Colocated with slice | Local import |
| **Internal utilities** | Colocated with feature | Local import |

### Adding New Features

| To Add... | Create File In... | Register In... |
|-----------|-------------------|----------------|
| New transform type | `packages/core/src/transforms/handlers/` | `handlers/index.ts` (import) |
| New editor behavior | `packages/client/src/behaviors/handlers/` | `handlers/index.ts` (import) |
| New StyleValue type | `packages/core/src/shared/css-values.ts` | Type registry interface |
| New API endpoint | `packages/service/src/api/handlers/` | Route registry |
| New shared type | `packages/core/src/shared/` | Export from `index.ts` |

### Test File Locations

Tests live in **their own files**, not in documentation. Test files are colocated with the code they test or grouped in `__tests__/` directories.

| Test Type | Location | Naming Convention |
|-----------|----------|-------------------|
| **Unit tests** (colocated) | Next to source file | `*.test.ts` / `*.test.tsx` |
| **Unit tests** (grouped) | `packages/*/src/__tests__/` | `*.test.ts` |
| **Integration tests** | `packages/*/src/__tests__/` | `*-flow.test.ts` |
| **E2E tests** | `e2e/` | `*.spec.ts` |
| **Test fixtures** | `packages/*/src/__tests__/fixtures/` | CSS/JSX files |
| **Test mocks** | `packages/*/src/__tests__/mocks/` | `*.ts` |

> **Note**: For testing strategy and rationale, see [09-TESTING.md](./09-TESTING.md).
> For test interface definitions, see [03-INTERFACES.md](./03-INTERFACES.md#8-testing-interfaces).

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    User's React App + Alara Client                      ││
│  │                                                                          ││
│  │   ┌───────────────────────────────────────────────────────────────────┐ ││
│  │   │                    User's Website Content                          │ ││
│  │   │                                                                    │ ││
│  │   │    Elements have `oid` attributes injected by Babel plugin         │ ││
│  │   │    <button oid="src/App.tsx:12:4">Click me</button>                │ ││
│  │   │                                                                    │ ││
│  │   └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                          ││
│  │   ┌───────────────────────────────────────────────────────────────────┐ ││
│  │   │               @alara/client (Vanilla JS, injected)                 │ ││
│  │   │                                                                    │ ││
│  │   │   ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐  │ ││
│  │   │   │ Selection   │  │ Text Edit   │  │ DOM Overlays             │  │ ││
│  │   │   │ Handlers    │  │ Handlers    │  │ - Selection box (blue)   │  │ ││
│  │   │   │ (click/     │  │ (dblclick,  │  │ - Hover box (dashed)     │  │ ││
│  │   │   │  hover)     │  │  keyboard)  │  │ - Status indicator       │  │ ││
│  │   │   └─────────────┘  └─────────────┘  └──────────────────────────┘  │ ││
│  │   │                          │                                         │ ││
│  │   │   ┌──────────────────────▼────────────────────────────────────┐   │ ││
│  │   │   │           Editor Store (Vanilla Zustand)                   │   │ ││
│  │   │   │  - selectedElement    - pendingEdits                       │   │ ││
│  │   │   │  - hoveredElement     - connectionStatus                   │   │ ││
│  │   │   │  - textEditState      - wsClient                           │   │ ││
│  │   │   └──────────────────────────────────┬────────────────────────┘   │ ││
│  │   └──────────────────────────────────────┼────────────────────────────┘ ││
│  └──────────────────────────────────────────┼──────────────────────────────┘│
│                                             │                                │
│                                WebSocket    │                                │
└─────────────────────────────────────────────┼────────────────────────────────┘
                                                  │
┌─────────────────────────────────────────────────▼────────────────────────────┐
│                        ALARA SERVICE (Bun)                                   │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         server.ts                                      │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  │
│  │  │ Static      │  │ Health      │  │ WebSocket   │  │ HMR Bridge   │  │  │
│  │  │ Serving     │  │ Endpoint    │  │ Router      │  │ (to Vite)    │  │  │
│  │  └─────────────┘  └──────┬──────┘  └──────┬──────┘  └──────────────┘  │  │
│  └───────────────────────────┼───────────────┼───────────────────────────┘  │
│                              │               │                               │
│  ┌───────────────────────────▼───────────────▼───────────────────────────┐  │
│  │              SERVICE LAYER (WebSocket Handlers) [Open/Closed]          │  │
│  │  service/api/handlers/     ← Add new endpoints here                    │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐          │  │
│  │  │transform.ts│ │ preview.ts │ │ styles.ts  │ │   ...      │          │  │
│  │  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └────────────┘          │  │
│  │        │              │              │                                 │  │
│  │        │    Validates input, formats response, orchestrates            │  │
│  └────────┼──────────────┼──────────────┼─────────────────────────────────┘  │
│           │              │              │                                    │
│  ┌────────▼──────────────▼──────────────▼─────────────────────────────────┐  │
│  │                      TransformEngine (Orchestrator)                     │  │
│  │               Delegates to Transform Registry (no switch!)              │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   │                                          │
│  ┌────────────────────────────────▼───────────────────────────────────────┐  │
│  │              CORE LAYER (Business Logic) [Open/Closed]                  │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │  │
│  │  │              Transform Registry (packages/core)                  │   │  │
│  │  │  ┌──────────────┬──────────────┬──────────────┬──────────────┐  │   │  │
│  │  │  │ css-update   │ css-add      │ text-update  │   ...        │  │   │  │
│  │  │  └──────────────┴──────────────┴──────────────┴──────────────┘  │   │  │
│  │  │         ↑ Pure AST manipulation (PostCSS, ts-morph)              │   │  │
│  │  │         ↑ Framework-agnostic, no HTTP knowledge                  │   │  │
│  │  │         ↑ Add new transforms here → auto-registers               │   │  │
│  │  └─────────────────────────────────────────────────────────────────┘   │  │
│  │                                                                         │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │  │
│  │  │ CSS Utilities    │  │ JSX Utilities    │  │ AST Cache (LRU)      │  │  │
│  │  │ (PostCSS-based)  │  │ (ts-morph)       │  │                      │  │  │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                   │                                          │
│  ┌────────────────────────────────▼───────────────────────────────────────┐  │
│  │                      FileWatcher                                        │  │
│  │  - Watches user's src/ directory                                        │  │
│  │  - Triggers code→visual sync on external changes                        │  │
│  │  - Coordinates with Vite HMR                                            │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
└──────────────────────────────┼───────────────────────────────────────────────┘
                               │
              ┌────────────────▼────────────────┐
              │         FILE SYSTEM              │
              │  user-project/src/               │
              │  ├── components/**/*.tsx         │
              │  ├── components/**/*.module.css  │
              │  └── pages/**/*.tsx              │
              └─────────────────────────────────┘
```

### Handler Layer Separation (Open/Closed Principle)

The architecture separates handlers into two layers:

| Layer | Location | Responsibility | Protocol Knowledge |
|-------|----------|----------------|-------------------|
| **Service Layer** | `service/api/handlers/` | Validate input, orchestrate core calls, format WS responses | Yes (WebSocket) |
| **Core Layer** | `core/transforms/handlers/` | Pure AST manipulation (CSS/JSX transforms) | No |

**Benefits**:
- Core logic is testable in isolation
- Core handlers can be reused (CLI tools, VS Code extension)
- Adding a transform = create file + import (no existing code modified)
- Adding a message type = create handler file + register (no existing code modified)

## Data Flow

### Visual → Code (User edits padding in FloatingToolbox)

```
1. User changes padding: 12px → 16px in FloatingToolbox
   │
   ▼
2. Editor Store dispatches action
   │  store.updateStyle({ property: 'padding', value: '16px' })
   │
   ▼
3. Command pushed to undoStack
   │  { type: 'update-style', before: '12px', after: '16px', ... }
   │
   ▼
4. Edit added to pendingEdits (UI shows loading indicator)
   │  NOTE: No optimistic DOM update - wait for Vite HMR
   │
   ▼
5. WebSocket sends transform request to Alara Service
   │  {
   │    action: 'transform',
   │    type: 'css-update',
   │    target: {
   │      file: 'src/components/Button/Button.module.css',
   │      selector: '.button',
   │      lineNumber: 5
   │    },
   │    change: { property: 'padding', value: '16px' }
   │  }
   │
   ▼
6. TransformEngine delegates to Transform Registry:
   │  a. Registry looks up 'css-update' handler
   │  b. Handler validates request with Zod schema
   │  c. Handler executes:
   │     - Load/parse CSS file with PostCSS (use cached AST if available)
   │     - Locate .button rule at line 5
   │     - Find or create padding declaration
   │     - Update value: 12px → 16px
   │     - Regenerate CSS (preserve formatting, comments)
   │  d. Transaction commits: write to file system
   │
   ▼
7. FileWatcher detects change, notifies Vite
   │
   ▼
8. Vite HMR hot-swaps CSS (no page reload)
   │
   ▼
9. Service sends confirmation to Builder
   │  { status: 'committed', requestId: '...' }
   │
   ▼
10. Store marks edit as committed, clears from pending
```

### Code → Visual (User edits in VS Code)

External file changes are detected via **Vite HMR**, not WebSocket. This eliminates race conditions.

```
1. User edits Button.module.css in VS Code
   │  .button { padding: 20px; }
   │
   ▼
2. Vite detects change, rebuilds module
   │  - Generates new oid/css attributes for changed elements
   │
   ▼
3. Vite HMR sends update to browser
   │  import.meta.hot.on('vite:beforeUpdate', ...)
   │
   ▼
4. Browser useViteHMR hook:
   │  a. clearPendingEditsForFile('Button.module.css')
   │  b. clearUndoRedoForFile('Button.module.css')
   │
   ▼
5. Vite HMR updates DOM with new styles
   │  - CSS changes applied automatically
   │  - DOM attributes updated with new oid/css values
   │
   ▼
6. FloatingToolbox re-renders with new values
```

> **Note**: Server-side AST cache is invalidated lazily on next request,
> not proactively on file change.

## Key Design Decisions

### Decision 1: Client-Side Injection (No Iframe)

**Choice**: Inject Alara client directly into user's running app via Vite plugin.

**Implementation**:
- `@alara/buildtime` Vite plugin injects `@alara/client` into the app
- Client runs alongside user's app, not in a separate frame
- Selection overlays rendered via DOM manipulation with fixed positioning
- Uses `pointer-events: none` on overlays to avoid capturing clicks

**Trade-offs**:
- Pro: Simpler event handling, no postMessage bridging
- Pro: Direct access to DOM elements with `oid` attributes
- Pro: No React dependency - works with any framework
- Con: Need careful CSS isolation for editor overlays (mitigate with unique prefixes, z-index)
- Con: Must handle cases where user app removes/recreates elements

### Decision 2: Command Pattern for Undo/Redo

**Choice**: Implement undo/redo via command pattern in Editor Store.

**Structure**: See [03-INTERFACES.md](./03-INTERFACES.md#52-command-types-undoredo) for full `Command` and `CommandType` definitions.

```typescript
// Each edit creates a Command with before/after state
undoStack: Command[];
redoStack: Command[];
maxStackSize: number;  // e.g., 100
```

**Behavior**:
- Each edit creates a Command pushed to undoStack
- Undo: Pop from undoStack, apply reverse transform, push to redoStack
- Redo: Pop from redoStack, apply forward transform, push to undoStack
- External file changes clear relevant commands from both stacks

### Decision 3: Build-Time Attribute Injection for Element Identification

**Choice**: Use Vite plugin to inject two **self-contained attributes** at build time:
- `oid` - JSX source location: `{file}:{line}:{col}`
- `css` - CSS Module location: `{cssFile}:{selectors}`

**Why Self-Contained Attributes (No Registry)**:
- **Simpler architecture**: No registry to sync with DOM
- **Self-contained**: All metadata encoded directly in attributes
- **HMR-friendly**: Only DOM attributes need updating
- **Easier debugging**: Inspect element shows all info directly

**Architecture**:
```html
<!-- All metadata encoded in attributes - no registry lookup needed -->
<button
  oid="src/components/Button/Button.tsx:12:4"
  css="src/components/Button/Button.module.css:.button .primary"
>
  Click me
</button>
```

**CSS Module Resolution** (at build time):
The Babel plugin traces `className={styles.X}` back to its CSS Module import:

```
className={`${styles.button} ${styles.primary}`}
    ↓ trace import
import styles from './Button.module.css'
    ↓ resolve to css attribute
css="src/components/Button/Button.module.css:.button .primary"
```

**Why build-time resolution** (not runtime):
- **No ambiguity**: We know exactly which CSS file to edit
- **No runtime lookup**: Backend doesn't need to parse TSX to find imports
- **Scoped support**: Only CSS Modules are editable (global styles explicitly excluded)
- **Single source of truth**: The import statement defines the mapping

**Scope Limitation**:
Alara only supports editing **CSS Module** styles. The following are NOT editable:
- Global CSS (e.g., `import './globals.css'`)
- Inherited styles from parent elements
- Styles from `node_modules`
- Inline styles (handled separately)

**Flow**:
1. User clicks element in canvas
2. EditorWrapper parses `oid` and `css` attributes from DOM element
3. Frontend sends `ElementTarget` to backend (file, line, col, cssFile, selectors)
4. Backend navigates directly to element at `file:line:col` via ts-morph
5. For CSS edits, backend opens `cssFile` and finds rules by `selectors`
6. No fuzzy matching needed - source location is always accurate

**On file change**:
- Vite rebuilds the file, generating new `oid` and `css` values
- HMR updates DOM attributes
- Selected element automatically has correct location after reload

### Decision 4: CSS Variables - DOM-First Editing

**Choice**: Edit via DOM, sync to source in background.

**Flow**:
1. User sees resolved value in FloatingToolbox (e.g., `#1a73e8`)
2. Toolbox shows "from var(--color-primary)" as hint
3. Editing the value:
   - Immediate: Update DOM via `element.style.setProperty()`
   - Background: Sync to CSS file (updates the variable OR creates override)
4. Option to "Edit Variable Definition" navigates to variables.css

### Decision 5: Registry Pattern for Extensibility

**Choice**: Use registries instead of switch statements for all extensible systems.

**Principle**: Code is **open for extension, closed for modification**. Adding a new feature means:
- Creating new files
- Registering with existing systems
- Never modifying core logic

**Registries Used**:

| Registry | Purpose | Location |
|----------|---------|----------|
| `transformRegistry` | Transform handlers (css-update, text-update, etc.) | `packages/core/src/transforms/` |
| `editorBehaviorsRegistry` | Editor behaviors (text-edit, resize, etc.) | `packages/client/src/behaviors/` |
| `StyleValueTypeRegistry` | CSS value types (unit, color, tuple, etc.) | `packages/core/src/shared/css-values.ts` |
| `routeRegistry` | API endpoint handlers | `packages/service/src/api/` |

**Registry Pattern Structure**:
```typescript
// 1. Define handler interface
interface TransformHandler<TRequest> {
  type: string;
  schema: z.ZodType<TRequest>;
  execute: (request: TRequest, ctx: Context) => Promise<Result>;
}

// 2. Create registry
class TransformRegistry {
  private handlers = new Map<string, TransformHandler<unknown>>();

  register<T>(handler: TransformHandler<T>): void {
    this.handlers.set(handler.type, handler);
  }

  async execute(request: { type: string }) {
    const handler = this.handlers.get(request.type);
    if (!handler) throw new Error(`Unknown type: ${request.type}`);
    return handler.execute(handler.schema.parse(request), ctx);
  }
}

// 3. Register handlers via imports (auto-registration)
// packages/core/src/transforms/handlers/index.ts
import './css-update';    // Registers on import
import './text-update';   // Registers on import
import './add-variant';   // Registers on import
// To add new transform: create file, add import here
```

**Benefits**:
- New transforms added without touching TransformEngine
- New toolbox panels added without touching FloatingToolbox
- Type-safe via Zod validation at registration
- Discoverable (registry can list all registered types)

### Decision 6: Centralized Event Handlers + EditorBehaviorsRegistry

**Choice**: Document-level event handlers delegate to EditorBehaviorsRegistry for element-specific responses.

**Architecture** (Vanilla JS):
```
@alara/client (injected into user's app)
├── selection.ts - document-level click/hover handlers
├── text-editing.ts - document-level keyboard/focusout handlers
├── overlays.ts - DOM-based overlay rendering
│
└── behaviors/registry.ts - EditorBehaviorsRegistry
    ├── 'text-edit': TextEditBehavior (text elements only)
    └── ... add new behaviors without modifying handlers

Overlays (rendered via DOM manipulation, fixed positioning)
├── Selection box (blue outline around selected element)
├── Hover box (dashed outline on hover)
├── Status indicator (connection status)
└── ... add new overlays in overlays.ts
```

**What is a "Behavior"?**

A behavior defines how the editor responds when a user interacts with an element in edit mode. It is NOT about runtime functionality (button clicks, form submits), but about editing interactions.

| User Action | Element Type | Behavior Triggered |
|-------------|--------------|-------------------|
| Single click | Any | `select` → show outline |
| Double click | `<h1>`, `<p>`, `<span>` | `text-edit` → enter inline editing mode |
| Double click | `<img>` | `image-replace` → open image picker (future) |

**EditorBehaviorsRegistry Interface**:
```typescript
interface EditorBehavior {
  id: string;
  name: string;
  priority?: number;  // Higher = checked first

  // Which elements does this behavior apply to?
  appliesTo: (element: HTMLElement) => boolean;

  // What events does this behavior handle?
  onClick?: (element: HTMLElement, event: MouseEvent, ctx: BehaviorContext) => void;
  onDoubleClick?: (element: HTMLElement, event: MouseEvent, ctx: BehaviorContext) => void;
  onKeyDown?: (element: HTMLElement, event: KeyboardEvent, ctx: BehaviorContext) => void;
  onBlur?: (element: HTMLElement, event: FocusEvent, ctx: BehaviorContext) => void;
}
```

**Why Centralized + Registry (not per-element wrappers)**:

| Aspect | Centralized + Registry | Per-Element Wrappers |
|--------|----------------------|---------------------|
| Add new behavior | 1 file (behavior) | New wrapper + Babel plugin update |
| Fix selection bug | 1 file (selection.ts) | Every wrapper |
| Event coordination | ✅ Easy (single event stream) | Hard (distributed handlers) |
| Performance | ✅ One handler per event type | Handler per element |
| CSS interference | ✅ None (no wrapper DOM nodes) | Possible |
| React dependency | ✅ None (vanilla JS) | Required |

**Inspired by**: Onlook's architecture (attributes + centralized overlay management)

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Service Runtime** | Bun | Fast startup, native TS, built-in file watching |
| **CSS Parsing** | PostCSS | Battle-tested, preserves formatting, plugin ecosystem |
| **JSX Parsing** | ts-morph | TypeScript-native, high-level AST API |
| **Client State** | Zustand (vanilla) | Framework-agnostic, subscription-based updates |
| **Client Rendering** | Vanilla DOM | No React dependency, minimal bundle size |
| **WebSocket** | Bun.serve() | Native WebSocket support, single server |
| **File Watching** | Bun.watch() | Native, cross-platform, efficient |
| **CLI** | Commander.js | Standard Node CLI framework |

## Performance Targets

| Operation | Target | Strategy |
|-----------|--------|----------|
| Element selection | <16ms | Event delegation, pre-computed bounds |
| Property panel render | <50ms | Virtualized lists, memoization |
| Pending state update | <100ms | Zustand subscriptions, no I/O |
| File write + HMR | <300ms | Debounced writes, Vite's CSS HMR |
| CSS AST parse (cold) | <500ms | Stream parsing for large files |
| CSS AST parse (cached) | <10ms | In-memory cache (10 files) |
| JSX parse (on-demand) | <5ms | ts-morph, no caching needed |

## Decided Questions

### Q1: Client Architecture
**Decision**: Inject `@alara/client` directly into user's running Vite app

- No separate Builder UI app - client runs alongside user's app
- Alara service at `localhost:4000` handles WebSocket and file transforms
- User runs `alara dev` in one terminal, `npm run dev` in another
- Client is vanilla JS/TS, no React dependency

### Q2: Attribute Injection & Client Injection
**Decision**: Vite plugin handles both at build time

- `@alara/buildtime` provides the Vite plugin
- Plugin runs during dev mode only (production builds unaffected)
- **Attribute injection**: Babel plugin adds `oid` attribute to every JSX element
- **Client injection**: Vite plugin injects `@alara/client` via transformIndexHtml
- Attributes are used by client to find source locations and send transforms to backend

### Q3: Multi-File Edits
**Decision**: Atomic transactions with rollback on failure

- All file operations collected before any writes
- File backups created before modification
- On failure: restore all backups, report error to UI
- On success: delete backups, confirm to UI
