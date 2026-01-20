# 05 - Algorithm Design

This document details the core algorithms for CSS/JSX transformations, element identification, sync logic, and conflict resolution.

## Table of Contents

- [1. Element Identification Algorithm](#1-element-identification-algorithm)
  - [1.1 Architecture Overview](#11-architecture-overview)
  - [1.2 Injected Attributes](#12-injected-attributes)
  - [1.3 Element Selection at Runtime](#13-element-selection-at-runtime)
  - [1.4 Backend Element Location](#14-backend-element-location)
  - [1.5 Selector Extraction](#15-selector-extraction)
- [2. CSS Transformation Algorithms](#2-css-transformation-algorithms)
  - [2.1 Property Update](#21-property-update)
  - [2.2 Property Addition (with Position)](#22-property-addition-with-position)
  - [2.3 Rule Finding (CSS Modules Aware)](#23-rule-finding-css-modules-aware)
  - [2.3 Variant Class Creation](#23-variant-class-creation)
  - [2.4 Format-Preserving CSS Update](#24-format-preserving-css-update)
- [3. JSX Transformation Algorithms](#3-jsx-transformation-algorithms)
  - [3.1 Element Location by Line Number](#31-element-location-by-line-number)
  - [3.2 className Merging](#32-classname-merging)
  - [3.3 className Removal](#33-classname-removal)
- [4. Text Transformation Algorithm](#4-text-transformation-algorithm)
  - [4.1 Text Content Update](#41-text-content-update)
  - [4.2 Text Node Identification](#42-text-node-identification)
- [5. Sync Logic Algorithms](#5-sync-logic-algorithms)
  - [5.1 Visual → Code Sync (User Edit Flow)](#51-visual--code-sync-user-edit-flow)
  - [5.2 Code → Visual Sync (External Edit Flow)](#52-code--visual-sync-external-edit-flow)
  - [5.3 Conflict Resolution (Last Write Wins)](#53-conflict-resolution-last-write-wins)
- [6. Transaction Algorithm](#6-transaction-algorithm)
  - [6.1 Atomic Commit](#61-atomic-commit)
  - [6.2 Sequential Rollback](#62-sequential-rollback)
- [7. AST Cache Algorithm](#7-ast-cache-algorithm)
  - [7.1 Simple CSS-Only Cache](#71-simple-css-only-cache)
  - [7.2 Cache Set](#72-cache-set)
  - [7.3 Cache Invalidation](#73-cache-invalidation)
- [8. Undo/Redo Algorithm](#8-undoredo-algorithm)
  - [8.1 Execute Undo](#81-execute-undo)
  - [8.2 Execute Redo](#82-execute-redo)
  - [8.3 Command Compression](#83-command-compression)
- [9. Debounce Algorithm for File Watcher](#9-debounce-algorithm-for-file-watcher)
- [10. Edit Flow (Wait for Server)](#10-edit-flow-wait-for-server)
  - [10.1 Submit Edit](#101-submit-edit)
  - [10.2 Handle Edit Result](#102-handle-edit-result)
- [11. FloatingToolbox Positioning (Floating UI)](#11-floatingtoolbox-positioning-floating-ui)
  - [11.1 Positioning Strategy](#111-positioning-strategy)
  - [11.2 Middleware Pipeline](#112-middleware-pipeline)
  - [11.3 Auto-Update Behavior](#113-auto-update-behavior)
  - [11.4 Why Floating UI vs Custom Algorithm](#114-why-floating-ui-vs-custom-algorithm)
- [Algorithm Complexity Summary](#algorithm-complexity-summary)
- [Edge Cases and Error Handling](#edge-cases-and-error-handling)
  - [CSS Transformation Edge Cases](#css-transformation-edge-cases)
  - [JSX Transformation Edge Cases](#jsx-transformation-edge-cases)
  - [Sync Edge Cases](#sync-edge-cases)

---
## 1. Element Identification Algorithm

Elements are identified using **build-time attribute injection**. The Vite plugin injects two self-contained attributes on every JSX element:
- `oid` - JSX source location: `{file}:{line}:{col}`
- `css` - CSS Module location: `{cssFile}:{selectors}`

**No registry needed** - all metadata is encoded directly in the attributes.

### 1.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BUILD TIME (Vite Plugin)                          │
│                                                                          │
│  Source JSX                         Transformed JSX                      │
│  ───────────                        ────────────────                     │
│  <div className={styles.card}>  →   <div                                 │
│    <h2>Title</h2>                     className={styles.card}            │
│  </div>                               oid="src/Card.tsx:12:4"            │
│                                       css="src/Card.module.css:.card">  │
│                                     <h2                                  │
│                                       oid="src/Card.tsx:13:6"            │
│                                       css="src/Card.module.css:.title"> │
│                                       Title                              │
│                                     </h2>                                │
│                                   </div>                                 │
│                                                                          │
│  All metadata is self-contained in attributes - no registry needed       │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        RUNTIME (Browser)                                 │
│                                                                          │
│  EditorWrapper:                                                          │
│  - Finds elements via [oid][css] attributes                              │
│  - Parses attributes directly to extract metadata                        │
│  - Provides selection context for FloatingToolbox                        │
│                                                                          │
│  On Selection:                                                           │
│  - Parse oid: "src/Card.tsx:12:4" → { file, lineNumber, column }         │
│  - Parse css: "src/Card.module.css:.card" → { cssFile, selectors }       │
│  - Send ElementTarget to backend for CSS/JSX transforms                  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Alara Service)                           │
│                                                                          │
│  - Receives ElementTarget from frontend (file + line + col + css info)   │
│  - Parses source file with ts-morph                                      │
│  - Navigates directly to element at line:col                             │
│  - Opens cssFile and finds rules by selectors                            │
│                                                                          │
│  No fuzzy matching needed - source location is always accurate           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Attribute Format

The Vite plugin injects two self-contained attributes on every JSX element:

| Attribute | Format | Example |
|-----------|--------|---------|
| `oid` | `{file}:{line}:{col}` | `src/components/Card.tsx:12:4` |
| `css` | `{cssFile}:{selectors}` | `src/components/Card.module.css:.card .primary` |

```typescript
// Parsed ElementTarget from DOM attributes
interface ElementTarget {
  file: string;        // Source file path
  lineNumber: number;  // Line number in source (1-indexed)
  column: number;      // Column number in source (1-indexed)
  cssFile: string;     // CSS Module file path
  selectors: string[]; // CSS selectors (e.g., ['.card', '.primary'])
}
```

### 1.3 Element Selection at Runtime

```
Algorithm: SELECT_ELEMENT(domElement: HTMLElement) → ElementTarget | null

1. Read attributes from DOM (injected at build time by Vite plugin):
   oid = domElement.getAttribute('oid')
   css = domElement.getAttribute('css')

2. If attributes are missing:
   - Walk up parent chain until element with [oid][css] is found
   - If none found: return null (not an editable element)

3. Parse oid: "src/Card.tsx:12:4"
   parts = oid.split(':')
   column = parseInt(parts.pop())
   lineNumber = parseInt(parts.pop())
   file = parts.join(':')  // Handle Windows paths with drive letters

4. Parse css: "src/Card.module.css:.card .primary"
   colonIndex = css.indexOf(':.')
   cssFile = css.slice(0, colonIndex)
   selectorsStr = css.slice(colonIndex + 1)
   selectors = selectorsStr.split(' ').filter(s => s.startsWith('.'))

5. Return ElementTarget:
   return { file, lineNumber, column, cssFile, selectors }
```

### 1.4 Backend Element Location

```
Algorithm: FIND_ELEMENT_AT_LOCATION(file, line, col) → JSXElement

1. Parse source file:
   sourceFile = project.getSourceFile(file)
   If not found: return Error("File not found")

2. Convert line:col to position:
   pos = sourceFile.getPositionOfLineAndCharacter(line - 1, col - 1)

3. Get node at position:
   node = sourceFile.getDescendantAtPos(pos)

4. Walk up to find JSX element:
   current = node
   While current:
     If current.kind in [JsxElement, JsxSelfClosingElement, JsxOpeningElement]:
       return current.asKind(SyntaxKind.JsxElement) ?? current
     current = current.parent

5. Return Error("No JSX element at location")
```

### 1.5 Selector Extraction

Extract CSS Module selector from className attribute.

> **Current Limitation**: Only the **first** CSS Module class is tracked.
> Template literals with multiple classes (e.g., `` `${styles.header} ${styles.active}` ``)
> will only have the first class editable. This is a known limitation documented in
> [02-MODULE-DESIGN.md](./02-MODULE-DESIGN.md#42-module-babel-plugin-alarats).

```
Algorithm: EXTRACT_SELECTOR(classNameValue: string) → string | null

Input: "{styles.container}" or "{`${styles.header} ${styles.active}`}"

1. Remove outer braces: "styles.container" or "`${styles.header} ${styles.active}`"

2. If simple member expression (styles.X):
   - Extract "X" as selector
   - Return ".X"

3. If template literal:
   - Find first ${styles.X} expression
   - Extract "X" as selector
   - Return ".X"
   - (Other classes in template are NOT tracked)

4. Return null if no CSS Module reference found
```

---

## 2. CSS Transformation Algorithms

### 2.1 Property Update

Update a CSS property value within a rule.

```
Algorithm: CSS_UPDATE(file, selector, property, value) → Result

Input:
  file: "src/components/Button.module.css"
  selector: ".container"
  property: "padding"
  value: "16px"

1. Get or parse AST:
   ast = cache.get(file) ?? postcss.parse(readFile(file))

2. Find rule by selector:
   rule = AST_FIND_RULE(ast, selector)
   If not found: return Error("Selector not found")

3. Find declaration:
   decl = rule.nodes.find(n => n.type === 'decl' && n.prop === property)

4. If decl exists:
   a. backup(file, property, decl.value)
   b. decl.value = value
5. Else:
   a. Create new declaration: newDecl = { prop: property, value: value }
   b. Append to rule: rule.append(newDecl)
   c. recordAdd(file, property)

6. Queue write: queueWrite(file, ast.toString())
7. Update cache: cache.set(file, ast)
8. Return Success
```

### 2.2 Property Addition (with Position)

Add a new CSS property to a rule with optional position control.

```
Algorithm: CSS_ADD(file, selector, property, value, position?) → Result

Input:
  file: "src/components/Button.module.css"
  selector: ".button"
  property: "transition"
  value: "all 0.2s ease"
  position: 'first' | 'last' | { after: 'background-color' }  // optional, default: 'last'

1. Get or parse AST:
   ast = cache.get(file) ?? postcss.parse(readFile(file))

2. Find rule by selector:
   rule = AST_FIND_RULE(ast, selector)
   If not found: return Error("Selector not found")

3. Check property doesn't exist:
   existing = rule.nodes.find(n => n.type === 'decl' && n.prop === property)
   If existing: return Error("Property already exists - use css-update instead")

4. Create declaration:
   decl = postcss.decl({ prop: property, value: value })

5. Insert at position:
   Case position === 'first':
     rule.prepend(decl)
   Case position === 'last' OR position is undefined:
     rule.append(decl)
   Case position.after:
     afterDecl = rule.nodes.find(n => n.type === 'decl' && n.prop === position.after)
     If afterDecl:
       afterDecl.after(decl)
     Else:
       rule.append(decl)  // Fallback to end

6. Record for undo: recordAdd(file, property)
7. Queue write: queueWrite(file, ast.toString())
8. Update cache: cache.set(file, ast)
9. Return Success
```

### 2.3 Rule Finding (CSS Modules Aware)

CSS Modules transform selectors. This algorithm handles both source and mangled names:

```
Algorithm: AST_FIND_RULE(ast, targetSelector) → Rule | null

1. Normalize target:
   normalizedTarget = targetSelector.startsWith('.')
     ? targetSelector.slice(1)  // Remove leading dot
     : targetSelector

2. Walk all rules in AST:
   For each rule R:
     a. Parse R.selector into individual selectors (split by comma)
     b. For each selector S:
        - If S === targetSelector: return R (exact match)
        - If S.includes(normalizedTarget): return R (CSS Modules match)

3. Return null (not found)
```

### 2.3 Variant Class Creation

Create a new CSS class with multiple properties:

```
Algorithm: CREATE_VARIANT_CLASS(file, variantName, styles) → Result

Input:
  file: "src/components/Card.module.css"
  variantName: "highlighted"
  styles: { "background-color": "#fff3cd", "border-color": "#ffc107" }

1. Parse AST:
   ast = cache.get(file) ?? postcss.parse(readFile(file))

2. Check for conflicts:
   existing = AST_FIND_RULE(ast, `.${variantName}`)
   If existing: return Error(`Variant "${variantName}" already exists`)

3. Validate variant name:
   If not /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(variantName):
     return Error("Invalid variant name")

4. Create rule:
   rule = postcss.rule({ selector: `.${variantName}` })

5. Add declarations:
   For each (prop, value) in styles:
     rule.append(postcss.decl({ prop, value }))

6. Find insertion point (after last rule, before any @-rules at end):
   insertIndex = ast.nodes.length
   For i from ast.nodes.length - 1 to 0:
     If ast.nodes[i].type !== 'atrule':
       insertIndex = i + 1
       break

7. Insert rule:
   ast.insertBefore(ast.nodes[insertIndex], rule)

8. Queue write and update cache
9. Return Success
```

### 2.4 Format-Preserving CSS Update

PostCSS preserves formatting. This algorithm ensures minimal diff:

```
Algorithm: PRESERVE_FORMATTING_UPDATE(decl, newValue) → void

1. Capture original formatting:
   originalBetween = decl.raws.between  // e.g., ": " or ":"
   originalImportant = decl.raws.important

2. Update value:
   decl.value = newValue

3. Restore formatting:
   decl.raws.between = originalBetween
   If originalImportant:
     decl.raws.important = originalImportant
```

---

## 3. JSX Transformation Algorithms

### 3.1 Element Location by Line Number

Find JSX element at a specific source line:

```
Algorithm: FIND_ELEMENT_AT_LINE(sourceFile, lineNumber) → Element | null

1. Convert line to position:
   pos = sourceFile.getPositionOfLineAndCharacter(lineNumber - 1, 0)

2. Get node at position:
   node = sourceFile.getDescendantAtPos(pos)
   If not node: return null

3. Walk up to find JSX element:
   current = node
   While current:
     If current.kind in [JsxElement, JsxSelfClosingElement]:
       return current
     current = current.parent

4. Return null
```

### 3.2 className Merging

Merge new class into existing className expression:

```
Algorithm: MERGE_CLASSNAME(currentValue, newClass) → string

Input cases:
  Case 1: "{styles.button}" + "styles.large"
  Case 2: "{`${styles.button}`}" + "styles.large"
  Case 3: "{`${styles.button} ${styles.active}`}" + "styles.large"

1. Detect pattern:
   isSimple = currentValue.match(/^\{styles\.\w+\}$/)
   isTemplate = currentValue.includes('`')

2. If isSimple:
   // {styles.button} → {`${styles.button} ${styles.large}`}
   inner = currentValue.slice(1, -1)  // "styles.button"
   return `{\`\${${inner}} \${${newClass}}\`}`

3. If isTemplate:
   // Find position before closing backtick
   insertPos = currentValue.lastIndexOf('`')
   // Insert new class expression
   return currentValue.slice(0, insertPos) +
          ` \${${newClass}}` +
          currentValue.slice(insertPos)

4. Else:
   // Unknown pattern - wrap in template
   inner = currentValue.slice(1, -1)
   return `{\`\${${inner}} \${${newClass}}\`}`
```

### 3.3 className Removal

Remove a specific class from className expression:

```
Algorithm: REMOVE_FROM_CLASSNAME(currentValue, classToRemove) → string

Input: "{`${styles.button} ${styles.large} ${styles.active}`}", "styles.large"

1. Extract template content:
   templateContent = currentValue.match(/`([^`]+)`/)[1]

2. Find and remove the class expression:
   pattern = new RegExp(`\\s*\\$\\{${escapeRegex(classToRemove)}\\}\\s*`)
   newContent = templateContent.replace(pattern, ' ').trim()

3. Simplify if only one class remains:
   classes = newContent.match(/\$\{[^}]+\}/g)
   If classes.length === 1:
     // Convert back to simple: {`${styles.button}`} → {styles.button}
     inner = classes[0].match(/\$\{([^}]+)\}/)[1]
     return `{${inner}}`

4. Rebuild template:
   return `{\`${newContent}\`}`
```

---

## 4. Text Transformation Algorithm

### 4.1 Text Content Update

Update text content while preserving whitespace and structure:

```
Algorithm: UPDATE_TEXT_CONTENT(file, originalText, newText) → Result

1. Parse source file:
   sourceFile = getSourceFile(file)

2. Find all JsxText nodes:
   jsxTexts = sourceFile.getDescendantsOfKind(SyntaxKind.JsxText)

3. Find matching node:
   For each jsxText in jsxTexts:
     // Normalize whitespace for comparison
     normalized = jsxText.getText().trim()
     If normalized === originalText.trim():

       a. Backup original:
          backup(file, 'text', jsxText.getText())

       b. Preserve surrounding whitespace:
          leading = jsxText.getText().match(/^\s*/)[0]
          trailing = jsxText.getText().match(/\s*$/)[0]
          fullNewText = leading + newText + trailing

       c. Replace text:
          jsxText.replaceWithText(fullNewText)

       d. Queue write
       e. Return Success

4. Return Error("Text not found")
```

### 4.2 Text Node Identification

Identify which text node to update when multiple exist:

```
Algorithm: IDENTIFY_TEXT_NODE(element, textContent) → TextNode | null

1. Get all direct text children:
   textNodes = element.getChildrenOfKind(SyntaxKind.JsxText)

2. If textNodes.length === 1:
   return textNodes[0]

3. For complex cases (multiple text nodes):
   For each textNode:
     If textNode.getText().includes(textContent):
       return textNode

4. Return null (not found)
```

---

## 5. Sync Logic Algorithms

### 5.1 Visual → Code Sync (User Edit Flow)

```
Algorithm: VISUAL_TO_CODE_SYNC(edit: PendingEdit) → Result

1. Validate edit against schema:
   validation = EditSchema.safeParse(edit)
   If not validation.success:
     return Error(formatZodError(validation.error))

2. Create transaction:
   tx = new Transaction()

3. Route to appropriate transformer:
   Switch edit.type:
     Case 'css-update':
       result = cssTransformer.update(edit, tx)
     Case 'text-update':
       result = textTransformer.update(edit, tx)
     Case 'add-variant':
       result = addVariant(edit, tx)
     Case 'apply-variant':
       result = jsxTransformer.applyVariant(edit, tx)

4. If result.success:
   a. Commit transaction: tx.commit()
   b. Notify Vite HMR (file write triggers it)
   c. Return Success(edit.id)
5. Else:
   a. Rollback transaction: tx.rollback()
   b. Return Error(result.error)
```

### 5.2 Code → Visual Sync (External Edit Flow)

When a file changes externally (e.g., user edits in VS Code), the sync is handled entirely by **Vite HMR**. No WebSocket message is sent.

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ File System  │    │   Vite HMR   │    │   Browser    │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       │ 1. File changed   │                   │
       │──────────────────>│                   │
       │                   │                   │
       │                   │ 2. Rebuild module │
       │                   │    + inject attrs │
       │                   │                   │
       │                   │ 3. Send HMR       │
       │                   │    update event   │
       │                   │──────────────────>│
       │                   │                   │
       │                   │                   │ 4. Browser receives
       │                   │                   │    vite:beforeUpdate
       │                   │                   │
       │                   │                   │ 5. Clear pending edits
       │                   │                   │    & undo/redo for file
       │                   │                   │
       │                   │                   │ 6. HMR replaces module
       │                   │                   │    DOM updated with
       │                   │                   │    new oid + css attributes
       │                   │                   │
```

**Why Vite HMR instead of WebSocket?**
- Eliminates race condition between WebSocket broadcast and HMR DOM update
- Single source of truth - Vite already knows which files changed
- Simpler architecture - no duplicate notification paths

```
Algorithm: CODE_TO_VISUAL_SYNC (via Vite HMR)

Browser-side only (no server involvement):

1. Listen for Vite HMR event in useViteHMR hook:
   import.meta.hot.on('vite:beforeUpdate', (payload: UpdatePayload) => {
     for (const update of payload.updates) {
       // Normalize URL-style path to project-relative path
       const file = update.path.replace(/^\//, '')
       clearPendingEditsForFile(file)
       clearUndoRedoForFile(file)
     }
     refreshSelectedElement()
   })

2. clearPendingEditsForFile(file):
   For each pendingEdit in store.pendingEdits:
     If pendingEdit.target.file === file:
       store.pendingEdits.delete(pendingEdit.id)

3. clearUndoRedoForFile(file):
   store.undoStack = store.undoStack.filter(
     cmd => cmd.target.file !== file
   )
   store.redoStack = store.redoStack.filter(
     cmd => cmd.target.file !== file
   )
   Also invalidate cached styles for the file

4. Vite HMR updates DOM automatically:
   - Plugin re-injects oid + css attributes with updated values
   - DOM elements receive new attribute values
   - refreshSelectedElement() re-reads computed styles from DOM
```

> **Note**: Server-side AST cache invalidation happens lazily on next request,
> not proactively on file change. This simplifies the architecture.

### 5.3 Conflict Resolution (Last Write Wins)

```
Algorithm: RESOLVE_CONFLICT(pendingEdit, externalChange) → Action

1. Compare timestamps:
   If externalChange.timestamp > pendingEdit.timestamp:
     // External change is newer - discard pending edit
     return DiscardPending

2. Compare file and property:
   If pendingEdit.target.file === externalChange.file:
     If pendingEdit is CSS change:
       // CSS changes might not conflict if different selectors
       If pendingEdit.selector affected by externalChange:
         return DiscardPending
       Else:
         return KeepPending (different selector, safe to keep)
     Else:
       // Text/JSX changes - always discard
       return DiscardPending

3. Different files - no conflict:
   return KeepPending
```

---

## 6. Transaction Algorithm

### 6.1 Atomic Commit

```
Algorithm: TRANSACTION_COMMIT(tx: Transaction) → Result

1. Execute writes (parallel):
   await Promise.all(
     tx.writes.map(w => Bun.write(w.path, w.content))
   )

2. Clear transaction state:
   tx.backups.clear()
   tx.writes = []
   tx.propertyBackups.clear()

3. Return Success
```

### 6.2 Sequential Rollback

Rollback continues even if some files fail, to maximize recovery.

```
Algorithm: TRANSACTION_ROLLBACK(tx: Transaction) → { restored, failed }

restored = []
failed = []

1. For each backup in tx.backups (sequential, not parallel):
   Try:
     writeFileSync(backup.path, backup.content)
     restored.push(backup.path)
   Catch error:
     console.error(`Rollback failed for ${backup.path}: ${error}`)
     failed.push(backup.path)

2. Clear transaction state:
   tx.backups.clear()
   tx.writes = []
   tx.propertyBackups.clear()

3. If failed.length > 0:
   console.error(`Rollback incomplete. Failed: ${failed.join(', ')}`)

4. Return { restored, failed }
```

> **Why sequential rollback?**
> - Parallel rollback might fail multiple files simultaneously
> - Sequential allows partial recovery - some files restored even if others fail
> - Failed files are logged for manual recovery

---

## 7. AST Cache Algorithm

**Simplified Design**: Cache only CSS files. JSX parsing is fast (~5ms) and doesn't need caching.
This eliminates dependency tracking between CSS and JSX files.

### 7.1 Simple CSS-Only Cache

```
Algorithm: CSS_CACHE_GET(file: string) → CSSStyleSheet | null

Cache structure:
  entries: Map<string, CSSStyleSheet>
  maxEntries: 10  // Simple limit, no LRU eviction

1. Return entries.get(file) or null
```

### 7.2 Cache Set

```
Algorithm: CSS_CACHE_SET(file: string, ast: CSSStyleSheet) → void

1. If entries.size >= maxEntries:
   // Simple eviction: clear oldest entry (first in map)
   entries.delete(entries.keys().next().value)

2. entries.set(file, ast)
```

### 7.3 Cache Invalidation

```
Algorithm: CSS_CACHE_INVALIDATE(file: string) → void

1. entries.delete(file)

// No dependency tracking needed - JSX is not cached
```

> **Why no JSX caching?**
> - JSX parsing with ts-morph is fast (~5ms per file)
> - CSS parsing with postcss is slower (~20ms per file)
> - Caching JSX requires tracking CSS imports for invalidation
> - Simpler architecture: cache only what's slow to parse

---

## 8. Undo/Redo Algorithm

### 8.1 Execute Undo

```
Algorithm: EXECUTE_UNDO() → Result

1. Check stack:
   If undoStack.length === 0:
     return Error("Nothing to undo")

2. Pop command:
   command = undoStack.pop()

3. Create reverse transform:
   reverseRequest = {
     type: command.type,
     target: command.target,
     change: command.type === 'update-style'
       ? { property: command.property, value: command.before }
       : { text: command.before }
   }

4. Execute reverse:
   result = transformEngine.transform(reverseRequest)

5. If result.success:
   a. Push to redo stack:
      redoStack.push(command)
      If redoStack.length > maxStackSize:
        redoStack.shift()
   b. Return Success
6. Else:
   a. Push command back (undo failed):
      undoStack.push(command)
   b. Return Error(result.error)
```

### 8.2 Execute Redo

```
Algorithm: EXECUTE_REDO() → Result

1. Check stack:
   If redoStack.length === 0:
     return Error("Nothing to redo")

2. Pop command:
   command = redoStack.pop()

3. Create forward transform:
   forwardRequest = {
     type: command.type,
     target: command.target,
     change: command.type === 'update-style'
       ? { property: command.property, value: command.after }
       : { text: command.after }
   }

4. Execute forward:
   result = transformEngine.transform(forwardRequest)

5. If result.success:
   a. Push to undo stack:
      undoStack.push(command)
      If undoStack.length > maxStackSize:
        undoStack.shift()
   b. Return Success
6. Else:
   a. Push command back (redo failed):
      redoStack.push(command)
   b. Return Error(result.error)
```

### 8.3 Command Compression

Compress consecutive edits to same property:

```
Algorithm: COMPRESS_COMMANDS(newCommand: Command) → void

1. Check if can compress:
   If undoStack.length === 0:
     undoStack.push(newCommand)
     return

2. Get last command:
   lastCommand = undoStack[undoStack.length - 1]

3. Check compression criteria:
   canCompress =
     lastCommand.type === newCommand.type AND
     lastCommand.target.file === newCommand.target.file AND
     lastCommand.target.lineNumber === newCommand.target.lineNumber AND
     lastCommand.property === newCommand.property AND
     (newCommand.timestamp - lastCommand.timestamp) < 1000  // Within 1 second

4. If canCompress:
   // Update last command's 'after' value, keep original 'before'
   lastCommand.after = newCommand.after
   lastCommand.timestamp = newCommand.timestamp
5. Else:
   undoStack.push(newCommand)
   If undoStack.length > maxStackSize:
     undoStack.shift()
```

---

## 9. Debounce Algorithm for File Watcher

```
Algorithm: DEBOUNCED_HANDLE_CHANGE(file: string) → void

State:
  timers: Map<string, Timer>
  debounceMs: 100

1. Cancel existing timer:
   existingTimer = timers.get(file)
   If existingTimer:
     clearTimeout(existingTimer)

2. Set new timer:
   timer = setTimeout(() => {
     timers.delete(file)
     PROCESS_FILE_CHANGE(file)
   }, debounceMs)

   timers.set(file, timer)
```

---

## 10. Edit Flow (Wait for Server)

**Simplified for MVP**: No optimistic updates. Wait for server confirmation before updating UI.
This eliminates rollback complexity and HMR race conditions.

### 10.1 Submit Edit

```
Algorithm: SUBMIT_EDIT(edit: PendingEdit) → void

Note: PendingEdit has { id, target, type, change, status, timestamp }
      For css-update: change = { property, value }

1. Track pending state (show loading indicator):
   pendingEdits.set(edit.id, { ...edit, status: 'pending' })

2. Send to server:
   wsClient.send(JSON.stringify({
     action: 'transform',
     id: edit.id,
     type: edit.type,
     target: edit.target,
     change: edit.change
   }))

3. Wait for server response (handled by WebSocket message handler)
```

### 10.2 Handle Edit Result

```
Algorithm: HANDLE_EDIT_RESULT(result: TransformResult) → void

1. Get pending edit:
   edit = pendingEdits.get(result.requestId)
   If not edit:
     return  // Already removed (e.g., by Vite HMR)

2. If result.success:
   a. Remove from pending:
      pendingEdits.delete(result.requestId)
   b. Vite HMR will update DOM automatically (no manual DOM update needed)

3. If !result.success:
   a. Update status and notify:
      edit.status = 'failed'
      edit.error = result.error
      pendingEdits.delete(result.requestId)
      showToast({ type: 'error', message: `Edit failed: ${result.error.message}` })
```

> **Why no optimistic updates for MVP?**
> - 50-100ms latency is acceptable for direct manipulation
> - Eliminates rollback complexity
> - Avoids race conditions with Vite HMR
> - DOM updates happen via HMR, not manual style manipulation
> - Can add optimistic updates in Phase 2 if latency becomes an issue

---

## 11. FloatingToolbox Positioning (Floating UI)

The FloatingToolbox appears near the selected element using the `@floating-ui/react` library for robust positioning.

### 11.1 Positioning Strategy

```typescript
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/react';

const { refs, floatingStyles, placement } = useFloating({
  placement: 'top',           // Prefer positioning above element
  middleware: [
    offset(12),               // 12px gap between toolbox and element
    flip({
      fallbackPlacements: ['bottom'],
      padding: 80,            // Account for toolbar height
    }),
    shift({
      padding: 12,            // Keep 12px from canvas edges
    }),
  ],
  whileElementsMounted: autoUpdate,  // Reposition on scroll/resize
});
```

### 11.2 Middleware Pipeline

Floating UI processes middleware in order:

```
1. offset(12)
   └── Adds 12px gap from reference element

2. flip({ fallbackPlacements: ['bottom'], padding: 80 })
   └── If toolbox would be within 80px of top edge:
       └── Flip to 'bottom' placement

3. shift({ padding: 12 })
   └── If toolbox would overflow canvas horizontally:
       └── Shift left/right to keep 12px from edges
```

### 11.3 Auto-Update Behavior

`whileElementsMounted: autoUpdate` handles:
- **Scroll events** - Toolbox follows element during canvas scroll
- **Resize events** - Recalculates position on window/canvas resize
- **Ancestor resize** - Handles container size changes
- **Layout shifts** - Repositions if DOM layout changes

### 11.4 Why Floating UI vs Custom Algorithm

| Approach | Pros | Cons |
|----------|------|------|
| Custom `getBoundingClientRect` | No dependency | Must handle scroll, resize, edge cases manually |
| Floating UI | Battle-tested, handles edge cases | 12KB dependency |

Floating UI chosen because:
1. Handles scroll/resize automatically via `autoUpdate`
2. Middleware pipeline is composable and extensible
3. Used by Radix UI, Headless UI, and other production libraries
4. No need to manually track scroll position or viewport bounds

---

## Algorithm Complexity Summary

| Algorithm | Time Complexity | Space Complexity |
|-----------|-----------------|------------------|
| Element Selection (DOM) | O(1) | O(1) |
| Element Location (Backend) | O(1) | O(1) |
| CSS Rule Finding | O(n) where n = rules in file | O(1) |
| Variant Creation | O(n) where n = rules in file | O(m) where m = properties |
| className Merging | O(1) | O(1) |
| Text Content Update | O(n) where n = text nodes | O(1) |
| Transaction Commit | O(f) where f = files to write | O(f) for backups |
| LRU Cache Eviction | O(n) where n = cache entries | O(1) |
| Undo/Redo | O(1) | O(s) where s = stack size |
| Command Compression | O(1) | O(1) |
| Toolbox Positioning (Floating UI) | O(1) | O(1) |

---

## Edge Cases and Error Handling

### CSS Transformation Edge Cases

1. **Selector with pseudo-classes**: `.button:hover` - Match base selector, apply to pseudo-class rule
2. **Media query rules**: `@media (min-width: 768px) { .button { ... } }` - Navigate into at-rule first
3. **CSS variables**: `var(--color)` as value - Preserve exactly, no transformation
4. **!important declarations**: Preserve `!important` flag when updating value
5. **Shorthand properties**: `margin: 10px` - Don't expand, update as single value

### JSX Transformation Edge Cases

1. **Conditional className**: `className={isActive ? styles.active : styles.inactive}` - Handle ternary
2. **Array-based className**: `className={[styles.a, styles.b].join(' ')}` - Append to array
3. **clsx/classnames utility**: `className={clsx(styles.a, { [styles.b]: condition })}` - Insert into call
4. **Spread props**: `{...props}` may contain className - Check for conflicts
5. **Fragment elements**: `<>` has no className - Skip, target children

### Sync Edge Cases

1. **Rapid consecutive edits**: Debounce and compress commands
2. **Edit during HMR reload**: Queue edits, apply after reload completes
3. **File deleted externally**: Clear selection, remove from cache, notify user
4. **Concurrent edits to same property**: Last write wins, earlier pending edits discarded
