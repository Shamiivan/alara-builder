# 10 - Implementation Plan

Breakdown for maximum extendability using Accelerate principles: deploy fast, test often, small batches.

---

## Phase 0: Type Foundation 

| Slice | Description |
|-------|-------------|
| **0.1 Zod Schemas** | StyleValue discriminated union, ElementTarget, transform request/response schemas |
| **0.2 CSS Value Parser** | css-tree tokenization → StyleValue types (unit, keyword, number, tuple) |
| **0.3 Color Parser** | colorjs.io integration for hex/rgb/hsl/oklch parsing and conversion |
| **0.4 PostCSS Utilities** | findRule, getDeclaration, setDeclaration, parseRuleStyles helpers |
| **0.5 Value Serializer** | toValue() - convert StyleValue back to CSS string |

---

## Phase 1: AST Infrastructure 

| Slice | Description |
|-------|-------------|
| **1.1 CSS Cache** | LRU cache for PostCSS ASTs (50MB/100 entry limit, mtime invalidation) |
| **1.2 Transaction System** | Atomic file writes with backup/rollback on failure |
| **1.3 JSX Transformer** | ts-morph utilities: findElementAt, addClassName, updateText |
| **1.4 Babel Plugin** | Build-time injection of `oid` attribute + OID registry population + CSS Module resolution |
| **1.5 Vite Plugin Shell** | Plugin entry point, dev-only transform, client script injection |

---

## Phase 2: Transform Engine 

| Slice | Description |
|-------|-------------|
| **2.1 Transform Registry** | Handler registration, Zod validation, dispatch by type |
| **2.2 TransformEngine** | Orchestrator: creates context, delegates to registry, manages transaction |
| **2.3 css-update Handler** | Update existing CSS property value |
| **2.4 css-add Handler** | Add new CSS property to rule |
| **2.5 css-remove Handler** | Remove CSS property from rule |
| **2.6 text-update Handler** | Replace JSX text content |

---

## Phase 3: Variant System 

| Slice | Description |
|-------|-------------|
| **3.1 add-variant Handler** | Create new CSS class + update JSX className (multi-file) |
| **3.2 apply-variant Handler** | Add existing variant class to element's className |
| **3.3 remove-variant Handler** | Remove variant class from element's className |
| **3.4 get-variants API** | Parse CSS file, return all class selectors as variants |

---

## Phase 4: Server Infrastructure 

| Slice | Description |
|-------|-------------|
| **4.1 Bun Server Shell** | Bun.serve() with static files + WebSocket upgrade |
| **4.2 WebSocket Handler** | Connection lifecycle, message routing, client tracking |
| **4.3 transform Action** | Validate request (includes computedValue from client), resolve CSS location, execute transform |
| **4.4 get-variants Action** | Parse CSS file, return available variants for component |
| **4.5 get-project Action** | Scan src/, return component list with CSS Module paths |
| **4.6 preview Action** | Dry-run transform, return before/after diff |
| **4.7 FileWatcher** | Bun.watch() with debounce, cache invalidation on external changes |

---

## Phase 5: Frontend Foundation 

| Slice | Description |
|-------|-------------|
| **5.1 Zustand Store** | Selection, hover, pending edits, undo/redo stacks |
| **5.2 WebSocket Hook** | Connect, reconnect, message handling, request/response correlation |
| **5.3 Vite HMR Hook** | Listen for file changes, clear pending edits, refresh selection |
| **5.4 Canvas Component** | Centralized click/hover/keyboard handling, event delegation |
| **5.5 Selection Overlay** | Blue outline positioned via element bounds |
| **5.6 Hover Overlay** | Light highlight on mouseover |

---

## Phase 6: Editor Behaviors 

| Slice | Description |
|-------|-------------|
| **6.1 Behaviors Registry** | EditorBehavior interface, appliesTo detection, event delegation |
| **6.2 Select Behavior** | Single click → select element, show toolbox |
| **6.3 Text Edit Behavior** | Double click → contentEditable, commit on Enter/blur |
| **6.4 Resize Behavior** | Drag handles → update width/height (future) |

---

## Phase 7: Floating Toolbox 

| Slice | Description |
|-------|-------------|
| **7.1 Toolbox Shell** | Floating UI positioning, tab bar, content area |
| **7.2 Tab Registry** | Register panels by ID, element-type filtering |
| **7.3 Spacing Panel** | Margin/padding inputs, BoxSides parsing, linked toggle |
| **7.4 Colors Panel** | Color picker, format selector, CSS variable hint |
| **7.5 Typography Panel** | Font-size, font-weight, line-height, font-family |
| **7.6 Border Panel** | Border width/style/color, border-radius corners |
| **7.7 Effects Panel** | Box-shadow, opacity, cursor |

---

## Phase 8: Undo/Redo + Polish 

| Slice | Description |
|-------|-------------|
| **8.1 Command Pattern** | Command interface, StyleCommand, TextCommand, VariantCommand |
| **8.2 Undo Stack** | Push on edit, pop on Ctrl+Z, max size limit |
| **8.3 Redo Stack** | Push on undo, clear on new edit, Ctrl+Shift+Z |
| **8.4 External Change Handling** | Clear undo/redo for file when Vite HMR fires |
| **8.5 Error Recovery** | Transaction rollback UI, retry prompts, error toasts |

---

## Phase 9: CLI + Integration 

| Slice | Description |
|-------|-------------|
| **9.1 CLI Entry** | Commander.js setup, dev/build/init commands |
| **9.2 dev Command** | Validate project, start server, open browser |
| **9.3 init Command** | Detect project type, install runtime, update vite.config |
| **9.4 Build Integration** | Production build strips `oid` attributes and OID registry |

---

## Testing Milestones

| Phase | Unit Tests | Integration | E2E |
|-------|-----------|-------------|-----|
| 0-1 | 50+ | 5 | 0 |
| 2-3 | 80+ | 15 | 2 |
| 4-5 | 100+ | 25 | 5 |
| 6-7 | 130+ | 35 | 10 |
| 8-9 | 150+ | 40 | 15 |

---

## Key Extensibility Checkpoints

After each phase, verify:

1. Can add new transform without modifying TransformEngine?
2. Can add new panel without modifying FloatingToolbox?
3. Can add new StyleValue type via module augmentation?
4. Can add new behavior without modifying Canvas?
5. Full test suite runs in <3 minutes?
