# 10 - Implementation Plan

Breakdown for maximum extendability using Accelerate principles: deploy fast, test often, small batches.

---

## Phase 0: Walking Skeleton

Validate integration early: CLI → Vite plugin → Bun server → client runtime round-trip.

| Slice | Description |
|-------|-------------|
| **0.1 CLI Entry** | Commander.js setup with `alara dev` command (stub that starts server) |
| **0.2 Vite Plugin Shell** | Plugin entry point, dev-only no-op transform, client script injection |
| **0.3 Bun Server Shell** | Bun.serve() with WebSocket upgrade, echo messages back |
bunx alara dev
| **0.4 Client Runtime** | Injected script that connects to WebSocket, logs connection status |
| **0.5 Integration Smoke Test** | E2E test: `alara dev` starts → client connects → message round-trips |

---

## Phase 1: Type Foundation

| Slice | Description |
|-------|-------------|
| **1.1 Zod Schemas** | StyleValue discriminated union, ElementTarget, transform request/response schemas |
| **1.2 CSS Value Parser** | css-tree tokenization → StyleValue types (unit, keyword, number, tuple) |
| **1.3 Color Parser** | colorjs.io integration for hex/rgb/hsl/oklch parsing and conversion |
| **1.4 PostCSS Utilities** | findRule, getDeclaration, setDeclaration, parseRuleStyles helpers |
| **1.5 Value Serializer** | toValue() - convert StyleValue back to CSS string |

---

## Phase 2: AST Infrastructure

| Slice | Description |
|-------|-------------|
| **2.1 CSS Cache** | LRU cache for PostCSS ASTs (50MB/100 entry limit, mtime invalidation) |
| **2.2 Transaction System** | Atomic file writes with backup/rollback on failure |
| **2.3 JSX Transformer** | ts-morph utilities: findElementAt, addClassName, updateText |
| **2.4 Babel Plugin** | Build-time injection of `oid` attribute + OID registry population + CSS Module resolution |
| **2.5 Vite Plugin Enhancement** | Integrate Babel plugin, connect to Bun server for OID registry sync |

---

## Phase 3: Transform Engine

| Slice | Description |
|-------|-------------|
| **3.1 Transform Registry** | Handler registration, Zod validation, dispatch by type |
| **3.2 TransformEngine** | Orchestrator: creates context, delegates to registry, manages transaction |
| **3.3 css-update Handler** | Update existing CSS property value |
| **3.4 css-add Handler** | Add new CSS property to rule |
| **3.5 css-remove Handler** | Remove CSS property from rule |
| **3.6 text-update Handler** | Replace JSX text content |

---

## Phase 4: Variant System

| Slice | Description |
|-------|-------------|
| **4.1 add-variant Handler** | Create new CSS class + update JSX className (multi-file) |
| **4.2 apply-variant Handler** | Add existing variant class to element's className |
| **4.3 remove-variant Handler** | Remove variant class from element's className |
| **4.4 get-variants API** | Parse CSS file, return all class selectors as variants |

---

## Phase 5: Server Actions

Build on the Bun server shell from Phase 0 with real message handlers.

| Slice | Description |
|-------|-------------|
| **5.1 Message Router** | Action dispatch, request/response correlation, error handling |
| **5.2 transform Action** | Validate request (includes computedValue from client), resolve CSS location, execute transform |
| **5.3 get-variants Action** | Parse CSS file, return available variants for component |
| **5.4 get-project Action** | Scan src/, return component list with CSS Module paths |
| **5.5 preview Action** | Dry-run transform, return before/after diff |
| **5.6 FileWatcher** | Bun.watch() with debounce, cache invalidation on external changes |

---

## Phase 6: Frontend Foundation

Build on the client runtime from Phase 0 with state management and canvas.

| Slice | Description |
|-------|-------------|
| **6.1 Zustand Store** | Selection, hover, pending edits, undo/redo stacks |
| **6.2 WebSocket Hook** | Reconnect logic, request/response correlation, connection status |
| **6.3 Vite HMR Hook** | Listen for file changes, clear pending edits, refresh selection |
| **6.4 Canvas Component** | Centralized click/hover/keyboard handling, event delegation |
| **6.5 Selection Overlay** | Blue outline positioned via element bounds |
| **6.6 Hover Overlay** | Light highlight on mouseover |

---

## Phase 7: Editor Behaviors

| Slice | Description |
|-------|-------------|
| **7.1 Behaviors Registry** | EditorBehavior interface, appliesTo detection, event delegation |
| **7.2 Select Behavior** | Single click → select element, show toolbox |
| **7.3 Text Edit Behavior** | Double click → contentEditable, commit on Enter/blur |
| **7.4 Resize Behavior** | Drag handles → update width/height (future) |

---

## Phase 8: Floating Toolbox

| Slice | Description |
|-------|-------------|
| **8.1 Toolbox Shell** | Floating UI positioning, tab bar, content area |
| **8.2 Tab Registry** | Register panels by ID, element-type filtering |
| **8.3 Spacing Panel** | Margin/padding inputs, BoxSides parsing, linked toggle |
| **8.4 Colors Panel** | Color picker, format selector, CSS variable hint |
| **8.5 Typography Panel** | Font-size, font-weight, line-height, font-family |
| **8.6 Border Panel** | Border width/style/color, border-radius corners |
| **8.7 Effects Panel** | Box-shadow, opacity, cursor |

---

## Phase 9: Undo/Redo + Polish

| Slice | Description |
|-------|-------------|
| **9.1 Command Pattern** | Command interface, StyleCommand, TextCommand, VariantCommand |
| **9.2 Undo Stack** | Push on edit, pop on Ctrl+Z, max size limit |
| **9.3 Redo Stack** | Push on undo, clear on new edit, Ctrl+Shift+Z |
| **9.4 External Change Handling** | Clear undo/redo for file when Vite HMR fires |
| **9.5 Error Recovery** | Transaction rollback UI, retry prompts, error toasts |

---

## Phase 10: CLI Polish + Production

Build on CLI shell from Phase 0 with init command and production build.

| Slice | Description |
|-------|-------------|
| **10.1 init Command** | Detect project type, install runtime, update vite.config |
| **10.2 dev Command Polish** | Validate project structure, open browser, graceful shutdown |
| **10.3 Build Integration** | Production build strips `oid` attributes and OID registry |
| **10.4 Error Messages** | Helpful CLI errors for common misconfigurations |

---

## Testing Milestones

| Phase | Unit Tests | Integration | E2E |
|-------|-----------|-------------|-----|
| 0 | 5+ | 1 | 1 (smoke test) |
| 1-2 | 50+ | 5 | 1 |
| 3-4 | 80+ | 15 | 3 |
| 5-6 | 100+ | 25 | 5 |
| 7-8 | 130+ | 35 | 10 |
| 9-10 | 150+ | 40 | 15 |

---

## Key Extensibility Checkpoints

After each phase, verify:

1. Can add new transform without modifying TransformEngine?
2. Can add new panel without modifying FloatingToolbox?
3. Can add new StyleValue type via module augmentation?
4. Can add new behavior without modifying Canvas?
5. Full test suite runs in <3 minutes?
