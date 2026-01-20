# 01 - High-Level Architecture

## System Overview

Alara Builder is a standalone Bun-based service that provides visual editing capabilities for React projects. It operates as a separate process that connects to the user's Vite dev server via WebSocket, enabling real-time bidirectional sync between the visual editor and source code.

## Package Structure

Monorepo using pnpm workspaces with **apps/** for deployables and **packages/** for shared libraries.
This structure follows the **Open/Closed Principle**: add new features by adding files, not modifying existing ones.

### Type Organization (Hybrid Approach)

Types are organized as:
- **Shared contracts** → `packages/core/src/shared/` (API boundaries, WebSocket messages, CSS values)
- **Implementation types** → Colocated with their features (component props, internal types)

This avoids a separate `packages/types` while keeping shared contracts in one place.

```
alara/
├── pnpm-workspace.yaml               # Workspace configuration
├── turbo.json                        # Build orchestration (parallel builds, caching)
├── tsconfig.base.json                # Shared TypeScript config
│
├── apps/
│   └── builder/                      # Visual editor UI (React + Vite)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/           # Component types colocated here
│       │   │   ├── Canvas/
│       │   │   │   ├── Canvas.tsx    # Centralized event handling
│       │   │   │   ├── overlays/     # Selection, Hover, Resize overlays
│       │   │   │   └── types.ts
│       │   │   ├── FloatingToolbox/
│       │   │   ├── Toolbar/
│       │   │   └── ...
│       │   ├── behaviors/            # ⬅ EDITOR BEHAVIORS (Open/Closed)
│       │   │   ├── registry.ts       #   EditorBehaviorsRegistry defined here
│       │   │   └── handlers/         #   Add new behaviors here
│       │   │       ├── index.ts      #   Auto-imports all behaviors
│       │   │       ├── text-edit.ts  #   Double-click text → inline editing
│       │   │       ├── resize.ts     #   Drag handles → resize element
│       │   │       └── ...
│       │   ├── store/
│       │   │   ├── index.ts          # Composes slices (add new slices here)
│       │   │   └── slices/           # Each slice has its own types
│       │   │       ├── selection.ts  # SelectionSlice type defined here
│       │   │       ├── editing.ts
│       │   │       ├── history.ts
│       │   │       └── ...
│       │   └── hooks/
│       ├── package.json
│       └── vite.config.ts
│
├── packages/
│   ├── core/                         # Business logic + shared types
│   │   ├── src/
│   │   │   ├── shared/               # ═══ SHARED CONTRACTS (like Next.js) ═══
│   │   │   │   ├── css-values.ts     # StyleValue types + Zod schemas + parsers
│   │   │   │   ├── messages.ts       # WebSocket message types + schemas
│   │   │   │   ├── transforms.ts     # Transform request/response types
│   │   │   │   ├── elements.ts       # ElementTarget, shared element types
│   │   │   │   └── index.ts          # Public exports: import from '@alara/core/shared'
│   │   │   │
│   │   │   ├── transforms/           # Transform types colocated with handlers
│   │   │   │   ├── registry.ts       # TransformHandler interface defined here
│   │   │   │   └── handlers/         # ⬅ BUSINESS LOGIC: Pure AST manipulation (CSS/JSX)
│   │   │   │       ├── index.ts      #   Framework-agnostic, no HTTP knowledge
│   │   │   │       ├── css-update.ts #   Defines WHAT transforms do
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
│   │   │   ├── server.ts
│   │   │   ├── api/
│   │   │   │   ├── router.ts         # Route types colocated
│   │   │   │   └── handlers/         # ⬅ HTTP ROUTING: Request/response handling
│   │   │   │       ├── transform.ts  #   Validates input, calls core handlers, formats responses
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
│   ├── runtime/                      # Injected into user's app
│   │   ├── src/
│   │   │   ├── vite-plugin.ts        # Vite plugin entry point
│   │   │   ├── babel-plugin-alara.ts # ⬅ CSS MODULE RESOLUTION: Traces className → import → cssFile
│   │   │   │                         #   Injects: oid + css attributes (self-contained)
│   │   │   ├── wrapper.tsx           # EditorWrapperProps defined here
│   │   │   └── client.ts             # Uses shared/messages.ts
│   │   └── package.json
│   │
│   ├── ui/                           # Shared UI components
│   │   ├── src/
│   │   │   ├── inputs/               # Input types colocated
│   │   │   │   ├── ValueInput.tsx    # ValueInputProps defined here
│   │   │   │   ├── ColorPicker.tsx   # ColorPickerProps defined here
│   │   │   │   └── ...
│   │   │   ├── panels/
│   │   │   │   ├── registry.ts       # PropertyPanelPlugin interface here
│   │   │   │   └── plugins/
│   │   │   │       ├── index.ts
│   │   │   │       ├── padding.tsx
│   │   │   │       ├── color.tsx
│   │   │   │       └── ...
│   │   │   └── overlays/
│   │   └── package.json
│   │
│   └── tooling/                      # Shared tooling configs (not types)
│       ├── tsconfig/
│       │   └── base.json
│       └── eslint/
│           └── preset.js
│
└── cli/                              # CLI entry point (bunx alara)
    ├── src/
    │   ├── index.ts
    │   └── commands/
    │       ├── dev.ts
    │       ├── build.ts
    │       └── init.ts
    └── package.json
```

### Package Dependency Graph

```
┌──────────────────────────────────────────────────────────────────┐
│                        apps/builder                               │
│                   (imports from packages)                         │
└───────────────────────────┬──────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
      ┌───────────┐   ┌───────────┐   ┌───────────┐
      │packages/ui│   │packages/  │   │packages/  │
      │           │   │  service  │   │  runtime  │
      └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
            │               │               │
            └───────────────┼───────────────┘
                            ▼
              ┌─────────────────────────┐
              │     packages/core       │
              │  ┌───────────────────┐  │
              │  │  src/shared/      │  │  ← Shared contracts live here
              │  │  - css-values.ts  │  │
              │  │  - messages.ts    │  │
              │  │  - transforms.ts  │  │
              │  └───────────────────┘  │
              └─────────────────────────┘
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

### Adding New Features (Open/Closed)

| To Add... | Create File In... | Register In... |
|-----------|-------------------|----------------|
| New transform type | `packages/core/src/transforms/handlers/` | `handlers/index.ts` (import) |
| New editor behavior | `apps/builder/src/behaviors/handlers/` | `handlers/index.ts` (import) |
| New property editor | `packages/ui/src/panels/plugins/` | `plugins/index.ts` (import) |
| New StyleValue type | `packages/core/src/shared/css-values.ts` | Type registry interface |
| New store slice | `apps/builder/src/store/slices/` | `store/index.ts` (compose) |
| New API endpoint | `packages/service/src/api/handlers/` | Route registry |
| New shared type | `packages/core/src/shared/` | Export from `index.ts` |

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Builder UI (React)                                   ││
│  │  ┌──────────────┐  ┌────────────────────────────────────────────────┐  ││
│  │  │   Toolbar    │  │                    Canvas                       │  ││
│  │  │              │  │   ┌──────────┐  ┌─────────────────────────┐    │  ││
│  │  │ [Pointer]    │  │   │  User's  │  │   FloatingToolbox       │    │  ││
│  │  │ [Text]       │  │   │  Website │  │  [Layout][Spacing]...   │    │  ││
│  │  │ [Preview]    │  │   │ (direct  │  └─────────────────────────┘    │  ││
│  │  │              │  │   │ render)  │      ↑ positioned via           │  ││
│  │  └──────────────┘  │   └──────────┘      Floating UI               │  ││
│  │                    │   + Selection Overlay                          │  ││
│  │                    └────────────────────────────────────────────────┘  ││
│  │                              │                                          ││
│  │                    ┌─────────▼────────────────────────▼─────────┐       ││
│  │                    │           Editor Store (Zustand)            │       ││
│  │                    │  - selectedElement    - pendingEdits        │       ││
│  │                    │  - hoveredElement     - undoStack           │       ││
│  │                    │  - editingState       - wsConnection        │       ││
│  │                    └─────────────────────────┬───────────────────┘       ││
│  └──────────────────────────────────────────────┼───────────────────────────┘│
│                                                 │                            │
│                                    WebSocket    │                            │
└─────────────────────────────────────────────────┼────────────────────────────┘
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

### Decision 1: Direct Rendering (No Iframe)

**Choice**: Render user's app directly in Builder using React's component composition.

**Implementation**:
- User's app components are imported and rendered inside Builder's Canvas
- EditorWrapper components injected around selectable elements
- Selection overlays rendered as siblings (not children) to avoid style conflicts
- Use CSS `pointer-events` to control interaction mode

**Trade-offs**:
- Pro: Simpler event handling, no postMessage bridging
- Pro: Direct access to React component tree
- Con: Need careful CSS isolation for editor UI
- Con: Editor styles could theoretically conflict (mitigate with unique prefixes)

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
| `editorBehaviorsRegistry` | Editor behaviors (text-edit, resize, etc.) | `apps/builder/src/behaviors/` |
| `toolboxTabRegistry` | Toolbox tab panels (spacing, colors, etc.) | `apps/builder/src/components/FloatingToolbox/panels/` |
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

### Decision 6: Centralized Canvas + EditorBehaviorsRegistry

**Choice**: Canvas handles all user interactions centrally, delegates to EditorBehaviorsRegistry for element-specific responses.

**Architecture**:
```
Canvas (centralized event handling)
├── handles: click, hover, doubleClick, drag, keyboard
├── delegates to: EditorBehaviorsRegistry
│
EditorBehaviorsRegistry (Open/Closed principle)
├── 'select': SelectBehavior (default for all elements)
├── 'text-edit': TextEditBehavior (text elements only)
├── 'image-replace': ImageReplaceBehavior (images only)
├── 'resize': ResizeBehavior (block elements)
└── ... add new behaviors without modifying Canvas

Overlays (rendered as Canvas siblings, NOT inside elements)
├── SelectionOverlay (blue outline around selected element)
├── HoverOverlay (light highlight on hover)
├── TextEditingOverlay (contentEditable UI)
├── ResizeHandlesOverlay (corner/edge drag handles)
└── ... add new overlays without modifying Canvas
```

**What is a "Behavior"?**

A behavior defines how the editor responds when a user interacts with an element in edit mode. It is NOT about runtime functionality (button clicks, form submits), but about editing interactions.

| User Action | Element Type | Behavior Triggered |
|-------------|--------------|-------------------|
| Single click | Any | `select` → show outline, show FloatingToolbox |
| Double click | `<h1>`, `<p>`, `<span>` | `text-edit` → enter inline editing mode |
| Double click | `<img>` | `image-replace` → open image picker |
| Drag edge | `<div>`, `<section>` | `resize` → update width/height |

**EditorBehaviorsRegistry Interface**:
```typescript
interface EditorBehavior {
  id: string;

  // Which elements does this behavior apply to?
  appliesTo: (element: HTMLElement, capabilities: ElementCapabilities) => boolean;

  // What events does this behavior handle?
  onDoubleClick?: (element: HTMLElement, ctx: BehaviorContext) => void;
  onDragStart?: (element: HTMLElement, ctx: BehaviorContext) => void;
  onDrag?: (element: HTMLElement, delta: Point, ctx: BehaviorContext) => void;
  onDragEnd?: (element: HTMLElement, ctx: BehaviorContext) => void;
  onKeyDown?: (element: HTMLElement, event: KeyboardEvent, ctx: BehaviorContext) => void;

  // What overlay should be shown when this behavior is active?
  overlay?: React.ComponentType<{ element: HTMLElement }>;
}
```

**Why Centralized + Registry (not per-element wrappers)**:

| Aspect | Centralized + Registry | Per-Element Wrappers |
|--------|----------------------|---------------------|
| Add new behavior | 1 file (behavior) + 1 file (overlay) | New wrapper + Babel plugin update |
| Fix selection bug | 1 file (Canvas or SelectBehavior) | Every wrapper |
| Event coordination | ✅ Easy (single event stream) | Hard (distributed handlers) |
| Performance | ✅ One handler per event type | Handler per element |
| CSS interference | ✅ None (no wrapper DOM nodes) | Possible |

**Inspired by**: Onlook's architecture (attributes + centralized overlay management)

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Service Runtime** | Bun | Fast startup, native TS, built-in file watching |
| **CSS Parsing** | PostCSS | Battle-tested, preserves formatting, plugin ecosystem |
| **JSX Parsing** | ts-morph | TypeScript-native, high-level AST API |
| **Builder State** | Zustand | Minimal boilerplate, subscription-based updates |
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

### Q1: Builder UI Hosting
**Decision**: Alara service serves built React app at `localhost:4000`

- Single Bun server handles both API and static file serving
- Builder UI built with Vite, output to `service/src/static/`
- No dependency on user's dev server for hosting

### Q2: EditorWrapper Injection & Attribute Injection
**Decision**: Vite plugin transforms JSX at build time

- Runtime package `@alara/runtime` provides the Vite plugin
- Plugin runs during dev mode only (production builds unaffected)
- **Attribute injection**: Adds `oid` and `css` attributes to every JSX element (self-contained, no registry)
- **EditorWrapper**: Wraps components to provide selection/hover context at runtime
- Attributes are used by backend to find source locations; wrappers are for visual editing UI

### Q3: Multi-File Edits
**Decision**: Atomic transactions with rollback on failure

- All file operations collected before any writes
- File backups created before modification
- On failure: restore all backups, report error to UI
- On success: delete backups, confirm to UI
