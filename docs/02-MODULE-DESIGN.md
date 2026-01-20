# 02 - Module/Component Design

This document details the internal structure of each module, their responsibilities, and interactions. Design patterns are informed by analysis of Onlook, Webstudio, and Builder.io architectures.

## Design Patterns Used

| Pattern | Usage | Reference |
|---------|-------|-----------|
| **Registry Pattern** | Extensible handlers for transforms, property editors, routes | Open/Closed Principle |
| **Command Pattern** | Undo/redo via reversible command objects | Custom |
| **Transaction Queue** | Batched file writes with retry/recovery | Webstudio |
| **Slice Composition** | Zustand store composed from independent slices | Modern React |
| **Observable Store** | Zustand with subscriptions for reactive UI | All three |
| **Typed CSS Values** | Discriminated union types for all CSS values with Zod validation | Webstudio |
| **Type Registry** | Extensible discriminated unions via interface augmentation | TypeScript |

> **Note**: All CSS property values use the **Typed CSS Value System** defined in [04-DATA-DESIGN.md](./04-DATA-DESIGN.md#4-typed-css-value-system).
> This enables validation before file writes, smart UI controls, and semantic operations.

> **Extensibility**: All systems use the **Registry Pattern** from [01-ARCHITECTURE.md](./01-ARCHITECTURE.md#decision-5-registry-pattern-for-extensibility).
> Add new features by creating new files and registering them - never modify existing code.

---

## 1. CLI Package (`@alara/cli`)

Entry point for developers. Minimal logic - delegates to service.

### 1.1 Module: `index.ts`

```typescript
#!/usr/bin/env bun
import { Command } from 'commander';
import { dev } from './commands/dev';
import { build } from './commands/build';
import { init } from './commands/init';

const program = new Command()
  .name('alara')
  .description('Visual editor for React + CSS Modules')
  .version('0.1.0');

program.command('dev').description('Start Alara dev server').action(dev);
program.command('build').description('Build for production').action(build);
program.command('init').description('Initialize Alara in project').action(init);

program.parse();
```

### 1.2 Module: `commands/dev.ts`

```typescript
interface DevOptions {
  port?: number;      // Default: 4000
  projectDir?: string; // Default: process.cwd()
  vitePort?: number;  // User's Vite dev server port (auto-detect)
}

export async function dev(options: DevOptions): Promise<void> {
  // 1. Validate project structure (has vite.config, src/, etc.)
  // 2. Check for @alara/runtime in dependencies
  // 3. Start Alara service (imports from @alara/service)
  // 4. Open browser to localhost:4000
}
```

### 1.3 Module: `commands/init.ts`

```typescript
export async function init(): Promise<void> {
  // 1. Detect project type (Vite, Next.js, etc.)
  // 2. Install @alara/runtime as devDependency
  // 3. Update vite.config.ts to include Alara plugin
  // 4. Create alara.config.ts with defaults
}
```

---

## 2. Service Package (`@alara/service`)

Core Bun server handling API, WebSocket, and file operations.

### 2.1 Module: `server.ts`

Main entry point. Composes all handlers into single Bun.serve() instance.

```typescript
import { createWebSocketHandler } from './ws/handler';
import { createApiRouter } from './api/router';
import { TransformEngine } from './engine/TransformEngine';
import { FileWatcher } from './watcher/FileWatcher';

interface ServerConfig {
  port: number;
  projectDir: string;
  staticDir: string;  // Built builder UI
}

export function createServer(config: ServerConfig) {
  const engine = new TransformEngine(config.projectDir);
  const watcher = new FileWatcher(config.projectDir, engine);

  return Bun.serve({
    port: config.port,

    fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === '/ws') {
        return server.upgrade(req) ? undefined : new Response('Upgrade failed', { status: 400 });
      }

      // API routes
      if (url.pathname.startsWith('/api/')) {
        return createApiRouter(engine).handle(req);
      }

      // Static files (Builder UI)
      return serveStatic(config.staticDir, url.pathname);
    },

    websocket: createWebSocketHandler(engine, watcher),
  });
}
```

### Handler Architecture Note

> **Two Types of Handlers**: This architecture has two distinct handler layers:
>
> | Location | Purpose | Responsibility |
> |----------|---------|----------------|
> | `core/transforms/handlers/` | **Business logic** | Pure transform operations (CSS/JSX AST manipulation). Framework-agnostic, no HTTP/WebSocket knowledge. Defines *what* transformations do. |
> | `service/api/handlers/` | **HTTP/API routing** | Route handlers that receive HTTP requests, validate input, orchestrate calls to core handlers, and format responses. Defines *how* the service exposes functionality. |
>
> This separation enables core logic to be tested in isolation and reused in other contexts (CLI tools, VS Code extensions) without the HTTP layer.

### 2.2 Module: `transforms/registry.ts`

**Transform Registry** - the core of extensibility. Handlers register themselves; the engine executes them.

```typescript
// packages/core/src/transforms/registry.ts
import { z } from 'zod';

/**
 * Context passed to all transform handlers.
 */
export interface TransformContext {
  projectDir: string;
  cssCache: CSSCache;  // CSS-only cache (JSX is parsed on-demand)
  project: Project;     // ts-morph Project for JSX parsing (not cached)
  transaction: Transaction;
}

/**
 * Interface for transform handlers.
 * Each handler is responsible for one type of transformation.
 */
export interface TransformHandler<TRequest = unknown> {
  /** Unique type identifier (e.g., 'css-update', 'text-update') */
  type: string;

  /** Zod schema for request validation */
  schema: z.ZodType<TRequest>;

  /** Execute the transformation */
  execute: (request: TRequest, ctx: TransformContext) => Promise<void>;

  /** Optional: Generate undo data before execution */
  getUndoData?: (request: TRequest, ctx: TransformContext) => Promise<unknown>;
}

/**
 * Registry for transform handlers.
 * Handlers register themselves on module load via imports.
 */
class TransformRegistry {
  private handlers = new Map<string, TransformHandler>();

  /**
   * Register a transform handler.
   * Called by each handler module on import.
   */
  register<TRequest>(handler: TransformHandler<TRequest>): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`Transform handler "${handler.type}" already registered`);
    }
    this.handlers.set(handler.type, handler as TransformHandler);
  }

  /**
   * Get handler by type.
   */
  get(type: string): TransformHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Execute a transform request.
   * Validates with Zod, then delegates to handler.
   */
  async execute(
    request: { type: string; [key: string]: unknown },
    ctx: TransformContext
  ): Promise<void> {
    const handler = this.handlers.get(request.type);
    if (!handler) {
      throw new Error(`Unknown transform type: ${request.type}`);
    }

    // Validate request with handler's schema
    const validated = handler.schema.parse(request);

    // Execute handler
    await handler.execute(validated, ctx);
  }

  /**
   * List all registered transform types.
   */
  getTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Singleton instance
export const transformRegistry = new TransformRegistry();
```

### 2.3 Module: `transforms/handlers/index.ts`

**Auto-registration** - import handlers to register them.

```typescript
// packages/core/src/transforms/handlers/index.ts

// Each import triggers registration via side effect
import './css-update';
import './css-add';
import './css-remove';
import './text-update';
import './add-variant';
import './apply-variant';
import './remove-variant';

// ─────────────────────────────────────────────────────────────
// TO ADD A NEW TRANSFORM:
// 1. Create: packages/core/src/transforms/handlers/my-transform.ts
// 2. Add import here: import './my-transform';
// 3. Done! No other files need modification.
// ─────────────────────────────────────────────────────────────

export { transformRegistry } from '../registry';
```

### 2.4 Module: `engine/TransformEngine.ts`

Thin orchestrator that delegates to the registry. **Never needs modification** when adding transforms.

```typescript
// packages/service/src/engine/TransformEngine.ts
import { transformRegistry } from '@alara/core/transforms';
import { CSSCache } from './cache/CSSCache';
import { Transaction } from './Transaction';

export class TransformEngine {
  private cssCache: CSSCache;
  private project: Project;
  private projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    this.cssCache = new CSSCache();
    this.project = new Project({
      tsConfigFilePath: path.join(projectDir, 'tsconfig.json'),
      skipAddingFilesFromTsConfig: true,
    });
  }

  /**
   * Process a transform request.
   * Delegates to registry - no switch statement needed.
   */
  async transform(request: TransformRequest): Promise<TransformResult> {
    const transaction = new Transaction();

    const ctx: TransformContext = {
      projectDir: this.projectDir,
      cssCache: this.cssCache,
      project: this.project,
      transaction,
    };

    try {
      // Registry handles dispatch based on request.type
      await transformRegistry.execute(request, ctx);

      await transaction.commit();
      return { success: true, requestId: request.id };

    } catch (error) {
      await transaction.rollback();
      return {
        success: false,
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Invalidate CSS cache for a file (called by FileWatcher on external changes)
   * Note: JSX is not cached, so no invalidation needed for TSX files
   */
  invalidateCache(filePath: string): void {
    if (filePath.endsWith('.css')) {
      this.cssCache.invalidate(filePath);
    }
  }

  /**
   * Get computed styles for an element (for FloatingToolbox display)
   */
  async getStylesForElement(target: ElementTarget): Promise<ComputedStyles> {
    // Parse CSS Module, find relevant selectors, return declarations
  }
}
```

### 2.5 Module: `transforms/handlers/css-update.ts`

**Example transform handler** - registers itself with the registry on import.
PostCSS-based CSS transformation. Preserves formatting and comments.

```typescript
// packages/core/src/transforms/handlers/css-update.ts
import { z } from 'zod';
import postcss, { Root, Rule, Declaration } from 'postcss';
import { transformRegistry, TransformHandler, TransformContext } from '../registry';
import {
  StyleValueSchema,
  ElementTargetSchema,
  toValue,
  parseCssValue,
} from '@alara/core/shared';

// ─────────────────────────────────────────────────────────────
// SCHEMA: Define the shape of requests this handler accepts
// ─────────────────────────────────────────────────────────────

const CSSUpdateRequestSchema = z.object({
  type: z.literal('css-update'),
  id: z.string(),
  target: ElementTargetSchema,
  change: z.object({
    property: z.string(),
    value: StyleValueSchema,
  }),
});

type CSSUpdateRequest = z.infer<typeof CSSUpdateRequestSchema>;

// ─────────────────────────────────────────────────────────────
// HANDLER: Implements the transformation logic
// ─────────────────────────────────────────────────────────────

const cssUpdateHandler: TransformHandler<CSSUpdateRequest> = {
  type: 'css-update',
  schema: CSSUpdateRequestSchema,

  async execute(request, ctx) {
    const { target, change } = request;
    const { property, value: typedValue } = change;

    // Convert typed value to CSS string
    const cssValue = toValue(typedValue);

    // DIRECT ACCESS: target.cssFile was resolved at build time by Babel plugin.
    // No import tracing or lookup needed - we navigate directly to the file.
    let root = ctx.cssCache.get(target.cssFile);
    if (!root) {
      const content = await Bun.file(target.cssFile).text();
      root = postcss.parse(content, { from: target.cssFile });
      await ctx.cssCache.set(target.cssFile, root);
    }

    // Find the rule by selector
    const rule = findRule(root, target.selector);
    if (!rule) {
      throw new Error(`Selector "${target.selector}" not found in ${target.cssFile}`);
    }

    // Find or create declaration
    let decl = rule.nodes?.find(
      (n): n is Declaration => n.type === 'decl' && n.prop === property
    );

    if (decl) {
      // Backup original for undo
      const originalTyped = parseCssValue(property, decl.value);
      ctx.transaction.backup(target.cssFile, property, originalTyped);
      decl.value = cssValue;
    } else {
      // Add new declaration
      const newDecl = postcss.decl({ prop: property, value: cssValue });
      rule.append(newDecl);
      ctx.transaction.recordAdd(target.cssFile, property);
    }

    // Queue file write
    ctx.transaction.queueWrite(target.cssFile, root.toString());
  },

  async getUndoData(request, ctx) {
    const root = ctx.cssCache.get(request.target.cssFile);
    if (!root) return null;

    const rule = findRule(root, request.target.selector);
    const decl = rule?.nodes?.find(
      (n): n is Declaration => n.type === 'decl' && n.prop === request.change.property
    );

    return decl ? parseCssValue(request.change.property, decl.value) : null;
  },
};

// ─────────────────────────────────────────────────────────────
// REGISTER: Handler registers itself when this module is imported
// ─────────────────────────────────────────────────────────────

transformRegistry.register(cssUpdateHandler);

// Helper function
function findRule(root: Root, selector: string): Rule | undefined {
  let found: Rule | undefined;
  root.walkRules((rule) => {
    if (rule.selector === selector) {
      found = rule;
    }
  });
  return found;
}
```

### 2.6 Module: `transforms/handlers/add-variant.ts`

**Multi-file handler** example - creates CSS class and updates JSX.

```typescript
// packages/core/src/transforms/handlers/add-variant.ts
import { z } from 'zod';
import postcss from 'postcss';
import { transformRegistry, TransformHandler } from '../registry';
import { StyleValueSchema, ElementTargetSchema, toValue } from '@alara/core/shared';
import { addClassNameToJSX } from '../../jsx/ast';

const AddVariantRequestSchema = z.object({
  type: z.literal('add-variant'),
  id: z.string(),
  target: ElementTargetSchema,
  change: z.object({
    variantName: z.string(),
    cssFile: z.string(),
    styles: z.record(z.string(), StyleValueSchema),
  }),
});

type AddVariantRequest = z.infer<typeof AddVariantRequestSchema>;

const addVariantHandler: TransformHandler<AddVariantRequest> = {
  type: 'add-variant',
  schema: AddVariantRequestSchema,

  async execute(request, ctx) {
    const { target, change } = request;
    const { variantName, cssFile, styles } = change;

    // 1. Create variant class in CSS Module
    let root = ctx.cssCache.get(cssFile);
    if (!root) {
      const content = await Bun.file(cssFile).text();
      root = postcss.parse(content, { from: cssFile });
      await ctx.cssCache.set(cssFile, root);
    }

    // Create new rule with typed values converted to CSS strings
    const rule = postcss.rule({ selector: `.${variantName}` });
    for (const [prop, typedValue] of Object.entries(styles)) {
      rule.append(postcss.decl({ prop, value: toValue(typedValue) }));
    }
    root.append(rule);
    ctx.transaction.queueWrite(cssFile, root.toString());

    // 2. Update JSX className to include variant
    await addClassNameToJSX(
      target.file,
      target.lineNumber,
      target.column,
      `styles.${variantName}`,
      ctx
    );
  },
};

transformRegistry.register(addVariantHandler);
```

### 2.7 Module: `css/CSSTransformer.ts` (Shared Utilities)

Shared CSS utilities used by handlers. **Not a handler itself**.

```typescript
// packages/core/src/css/CSSTransformer.ts
import postcss, { Root, Rule, Declaration } from 'postcss';
import { StyleValue, toValue, parseCssValue } from '@alara/core/shared';

/**
 * Shared CSS utilities for transform handlers.
 * This is NOT a handler - just helper functions.
 */

export function findRule(root: Root, selector: string): Rule | undefined {
  let found: Rule | undefined;
  root.walkRules((rule) => {
    if (rule.selector === selector) found = rule;
  });
  return found;
}

export function getDeclaration(rule: Rule, property: string): Declaration | undefined {
  return rule.nodes?.find(
    (n): n is Declaration => n.type === 'decl' && n.prop === property
  );
}

/**
 * Parse all styles from a rule into typed values.
 */
export function parseRuleStyles(rule: Rule): Map<string, StyleValue> {
  const styles = new Map<string, StyleValue>();
  rule.walkDecls((decl) => {
    styles.set(decl.prop, parseCssValue(decl.prop, decl.value));
  });
  return styles;
}

/**
 * Create a new variant class in the CSS Module.
 */
export async function createVariantClass(
  file: string,
  variantName: string,
  styles: Record<string, StyleValue>,
  ctx: TransformContext
): Promise<void> {
  let root = ctx.cssCache.get(file);
  if (!root) {
    const content = await Bun.file(file).text();
    root = postcss.parse(content, { from: file });
  }

  // Check if variant already exists
  if (findRule(root, `.${variantName}`)) {
    throw new Error(`Variant "${variantName}" already exists`);
  }

  // Create new rule with typed values converted to CSS strings
  const rule = postcss.rule({ selector: `.${variantName}` });
  for (const [prop, typedValue] of Object.entries(styles)) {
    rule.append(postcss.decl({ prop, value: toValue(typedValue) }));
  }

  root.append(rule);
  ctx.transaction.queueWrite(file, root.toString());
  await ctx.cssCache.set(file, root);
}
```

### 2.8 Module: `jsx/ast.ts`

ts-morph based JSX transformation.

```typescript
import { Project, SourceFile, JsxElement, JsxSelfClosingElement, ts } from 'ts-morph';

export class JSXTransformer {
  private project: Project;

  constructor(projectDir: string) {
    this.project = new Project({
      tsConfigFilePath: path.join(projectDir, 'tsconfig.json'),
      skipAddingFilesFromTsConfig: true,
    });
  }

  /**
   * Add a className to an element's existing className prop.
   */
  async addClassName(
    file: string,
    lineNumber: number,
    newClass: string,  // e.g., "styles.large"
    tx: Transaction
  ): Promise<void> {
    const sourceFile = this.getSourceFile(file);
    const element = this.findElementAtLine(sourceFile, lineNumber);

    if (!element) {
      throw new Error(`No JSX element found at line ${lineNumber}`);
    }

    const classNameAttr = this.getClassNameAttribute(element);

    if (!classNameAttr) {
      throw new Error('Element must have className attribute with CSS Modules pattern');
    }

    // Get current className value
    const initializer = classNameAttr.getInitializer();
    if (!initializer) {
      throw new Error('className has no value');
    }

    const currentValue = initializer.getText();
    tx.backup(file, 'className', currentValue);

    // Transform className to include new class
    // Handle: {styles.button} → {`${styles.button} ${styles.large}`}
    // Handle: {`${styles.button}`} → {`${styles.button} ${styles.large}`}
    const newValue = this.mergeClassName(currentValue, newClass);
    classNameAttr.setInitializer(newValue);

    tx.queueWrite(file, sourceFile.getFullText());
  }

  /**
   * Apply a variant by adding its class to className.
   */
  async applyVariant(request: ApplyVariantRequest, tx: Transaction): Promise<void> {
    await this.addClassName(
      request.file,
      request.lineNumber,
      `styles.${request.variantName}`,
      tx
    );
  }

  /**
   * Find JSX element at a specific line number.
   */
  private findElementAtLine(
    sourceFile: SourceFile,
    lineNumber: number
  ): JsxElement | JsxSelfClosingElement | undefined {
    const pos = sourceFile.compilerNode.getPositionOfLineAndCharacter(lineNumber - 1, 0);
    const node = sourceFile.getDescendantAtPos(pos);

    // Walk up to find JSX element
    let current = node;
    while (current) {
      if (current.getKind() === ts.SyntaxKind.JsxElement ||
          current.getKind() === ts.SyntaxKind.JsxSelfClosingElement) {
        return current as JsxElement | JsxSelfClosingElement;
      }
      current = current.getParent();
    }
    return undefined;
  }

  /**
   * Merge a new class into existing className expression.
   */
  private mergeClassName(current: string, newClass: string): string {
    // {styles.button} → {`${styles.button} ${styles.large}`}
    if (current.startsWith('{') && !current.includes('`')) {
      const inner = current.slice(1, -1); // Remove { }
      return `{\`\${${inner}} \${${newClass}}\`}`;
    }

    // {`${styles.button}`} → {`${styles.button} ${styles.large}`}
    if (current.includes('`')) {
      // Insert before closing backtick
      const insertPos = current.lastIndexOf('`');
      return current.slice(0, insertPos) + ` \${${newClass}}` + current.slice(insertPos);
    }

    return current;
  }

  private getSourceFile(file: string): SourceFile {
    // JSX not cached - parsed on demand (~5ms per file)
    // This simplifies architecture by avoiding CSS→JSX dependency tracking
    return this.project.addSourceFileAtPath(file);
  }

  private getClassNameAttribute(element: JsxElement | JsxSelfClosingElement) {
    const attrs = element.getKind() === ts.SyntaxKind.JsxElement
      ? (element as JsxElement).getOpeningElement().getAttributes()
      : (element as JsxSelfClosingElement).getAttributes();

    return attrs.find(a => a.getName?.() === 'className');
  }
}
```

### 2.9 Module: `transforms/handlers/text-update.ts`

**Text update handler** - registers itself with the registry on import.

```typescript
// packages/core/src/transforms/handlers/text-update.ts
import { z } from 'zod';
import { transformRegistry, TransformHandler, TransformContext } from '../registry';
import { ElementTargetSchema } from '@alara/core/shared';
import { ts } from 'ts-morph';

// ─────────────────────────────────────────────────────────────
// SCHEMA: Define the shape of requests this handler accepts
// ─────────────────────────────────────────────────────────────

const TextUpdateRequestSchema = z.object({
  type: z.literal('text-update'),
  id: z.string(),
  target: ElementTargetSchema,
  change: z.object({
    originalText: z.string(),
    newText: z.string(),
  }),
});

type TextUpdateRequest = z.infer<typeof TextUpdateRequestSchema>;

// ─────────────────────────────────────────────────────────────
// HANDLER: Implements the transformation logic
// ─────────────────────────────────────────────────────────────

const textUpdateHandler: TransformHandler<TextUpdateRequest> = {
  type: 'text-update',
  schema: TextUpdateRequestSchema,

  async execute(request, ctx) {
    const { target, change } = request;
    const { originalText, newText } = change;

    // Parse JSX on demand (not cached - ~5ms per file)
    const sourceFile = ctx.project.addSourceFileAtPath(target.file);

    // Find JsxText node matching original content
    const jsxTexts = sourceFile.getDescendantsOfKind(ts.SyntaxKind.JsxText);

    for (const jsxText of jsxTexts) {
      if (jsxText.getText().trim() === originalText.trim()) {
        ctx.transaction.backup(target.file, 'text', originalText);
        jsxText.replaceWithText(newText);
        ctx.transaction.queueWrite(target.file, sourceFile.getFullText());
        return;
      }
    }

    throw new Error(`Text "${originalText}" not found in ${target.file}`);
  },
};

// ─────────────────────────────────────────────────────────────
// REGISTER: Handler registers itself when this module is imported
// ─────────────────────────────────────────────────────────────

transformRegistry.register(textUpdateHandler);
```

### 2.10 Module: `engine/Transaction.ts`

Atomic file operations with rollback support.

```typescript
interface FileBackup {
  path: string;
  content: string;
}

interface QueuedWrite {
  path: string;
  content: string;
}

export class Transaction {
  private backups: Map<string, FileBackup> = new Map();
  private writes: QueuedWrite[] = [];
  private propertyBackups: Map<string, Map<string, string>> = new Map();

  // ─────────────────────────────────────────────────────────────
  // BACKUP METHODS - Two levels of granularity:
  //
  // 1. backupFile(path)        - Full file backup for TRANSACTION ROLLBACK
  //                              Used when transaction fails mid-way
  //                              Restores entire file to pre-transaction state
  //
  // 2. backup(file, prop, val) - Property backup for UNDO/REDO commands
  //                              Records individual changes for command stack
  //                              Enables fine-grained undo of specific properties
  // ─────────────────────────────────────────────────────────────

  /**
   * Backup entire file content (for transaction rollback on failure).
   * Called once per file before any modifications.
   */
  async backupFile(filePath: string): Promise<void> {
    if (this.backups.has(filePath)) return; // Already backed up

    const content = await Bun.file(filePath).text();
    this.backups.set(filePath, { path: filePath, content });
  }

  /**
   * Record a property's original value (for undo/redo command stack).
   * Called for each property being modified.
   */
  backup(file: string, property: string, value: string): void {
    if (!this.propertyBackups.has(file)) {
      this.propertyBackups.set(file, new Map());
    }
    this.propertyBackups.get(file)!.set(property, value);
  }

  /**
   * Queue a file write (executed on commit).
   */
  queueWrite(filePath: string, content: string): void {
    // Backup if not already done
    if (!this.backups.has(filePath)) {
      // Sync read for backup (transaction is already async)
      const existing = Bun.file(filePath);
      if (existing.size > 0) {
        this.backups.set(filePath, {
          path: filePath,
          content: existing.textSync()
        });
      }
    }

    // Replace any existing write for same file
    const existing = this.writes.findIndex(w => w.path === filePath);
    if (existing >= 0) {
      this.writes[existing].content = content;
    } else {
      this.writes.push({ path: filePath, content });
    }
  }

  /**
   * Execute all queued writes.
   */
  async commit(): Promise<void> {
    // Write all files
    await Promise.all(
      this.writes.map(w => Bun.write(w.path, w.content))
    );

    // Clear transaction state
    this.backups.clear();
    this.writes = [];
    this.propertyBackups.clear();
  }

  /**
   * Restore all files to their backed-up state.
   * Sequential to maximize recovery - continue even if some fail.
   */
  async rollback(): Promise<{ restored: string[]; failed: string[] }> {
    const restored: string[] = [];
    const failed: string[] = [];

    // Sequential rollback - continue even if some fail
    for (const backup of this.backups.values()) {
      try {
        await Bun.write(backup.path, backup.content);
        restored.push(backup.path);
      } catch (err) {
        console.error(`[Transaction] Failed to restore ${backup.path}:`, err);
        failed.push(backup.path);
      }
    }

    // Clear transaction state
    this.backups.clear();
    this.writes = [];
    this.propertyBackups.clear();

    if (failed.length > 0) {
      console.error(`[Transaction] Rollback incomplete. Failed: ${failed.join(', ')}`);
    }

    return { restored, failed };
  }
}
```

### 2.11 Module: `watcher/FileWatcher.ts`

Watches user's source files for external changes (IDE edits).

```typescript
export class FileWatcher {
  private engine: TransformEngine;
  private watcher: ReturnType<typeof Bun.watch> | null = null;
  private debounceTimers: Map<string, Timer> = new Map();
  private subscribers: Set<(change: ExternalChange) => void> = new Set();

  constructor(projectDir: string, engine: TransformEngine) {
    this.engine = engine;
    this.startWatching(projectDir);
  }

  private startWatching(projectDir: string): void {
    const srcDir = path.join(projectDir, 'src');

    this.watcher = Bun.watch(srcDir, {
      recursive: true,
    });

    // Note: Bun.watch is an async iterator
    (async () => {
      for await (const event of this.watcher!) {
        this.handleEvent(event);
      }
    })();
  }

  private handleEvent(event: { path: string; type: string }): void {
    const { path: filePath, type } = event;

    // Only care about CSS and TSX files
    if (!filePath.endsWith('.module.css') &&
        !filePath.endsWith('.tsx') &&
        !filePath.endsWith('.ts')) {
      return;
    }

    // Debounce: wait 100ms for more changes
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(filePath, setTimeout(() => {
      this.processChange(filePath, type);
      this.debounceTimers.delete(filePath);
    }, 100));
  }

  private async processChange(filePath: string, type: string): Promise<void> {
    // Invalidate AST cache (lazy - on next request)
    this.engine.invalidateCache(filePath);

    // NOTE: We do NOT broadcast external-change via WebSocket.
    // External changes are detected by the browser via Vite HMR.
    // This eliminates race conditions between HMR DOM updates and WebSocket.
    // See 05-ALGORITHMS.md Section 5.2 for details.
  }

  stop(): void {
    this.watcher?.stop();
    this.debounceTimers.forEach(t => clearTimeout(t));
  }
}
```

### 2.12 Module: `ws/handler.ts`

WebSocket handler for real-time communication with Builder UI.

```typescript
import type { ServerWebSocket } from 'bun';

interface ClientData {
  id: string;
  connectedAt: number;
}

export function createWebSocketHandler(engine: TransformEngine) {
  // NOTE: FileWatcher is NOT used here. External changes are detected
  // by the browser via Vite HMR, not WebSocket broadcasts.
  // See 05-ALGORITHMS.md Section 5.2 for details.

  const clients = new Map<string, ServerWebSocket<ClientData>>();

  function broadcast(message: object): void {
    const payload = JSON.stringify(message);
    clients.forEach(ws => ws.send(payload));
  }

  return {
    open(ws: ServerWebSocket<ClientData>) {
      const id = crypto.randomUUID();
      ws.data = { id, connectedAt: Date.now() };
      clients.set(id, ws);

      ws.send(JSON.stringify({ type: 'connected', clientId: id }));
    },

    async message(ws: ServerWebSocket<ClientData>, message: string) {
      try {
        const request = JSON.parse(message);

        switch (request.action) {
          case 'transform':
            // Transform includes computedValue from client's getComputedStyle()
            // Server resolves which CSS file/selector to edit
            const result = await engine.transform(request);
            ws.send(JSON.stringify(result));
            break;

          case 'get-variants':
            const variants = await engine.getVariants(request.cssFile);
            ws.send(JSON.stringify({ type: 'variants', requestId: request.id, ...variants }));
            break;

          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        }
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: error.message
        }));
      }
    },

    close(ws: ServerWebSocket<ClientData>) {
      clients.delete(ws.data.id);
    },
  };
}
```

---

## 3. Builder Package (`@alara/builder`)

React application for the visual editor UI.

### 3.1 Module: `store/editorStore.ts`

Central Zustand store. Inspired by Onlook's manager pattern but simpler.
Uses **Typed CSS Values** for all style operations.

**Types**: See [03-INTERFACES.md](./03-INTERFACES.md#5-store-interfaces) for:
- `EditorState`, `EditorActions` - Store shape and actions
- `ElementTarget`, `SelectedElement`, `HoveredElement` - Selection types
- `PendingEdit`, `Command`, `CommandType` - Edit tracking types

```typescript
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  StyleValue,
  toValue,
  parseCssValue,
} from '@alara/core/shared';
import type {
  EditorState,
  EditorActions,
  ElementTarget,
  PendingEdit,
  Command,
  ExternalChange,
} from '@alara/core/shared';

// --- Store Implementation ---

export const useEditorStore = create<EditorState & EditorActions>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    wsConnected: false,
    wsClient: null,
    selectedElement: null,
    hoveredElement: null,
    isTextEditing: false,
    textEditingTarget: null,
    pendingEdits: new Map(),
    undoStack: [],
    redoStack: [],
    maxStackSize: 100,
    activeToolboxTab: 'spacing' as ToolboxTabId | null,  // Default tab when element selected
    deviceMode: 'desktop',
    zoom: 100,
    previewMode: false,

    // --- Actions ---

    connect(url: string) {
      const ws = new WebSocket(url);

      ws.onopen = () => set({ wsConnected: true, wsClient: ws });
      ws.onclose = () => set({ wsConnected: false, wsClient: null });

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        switch (message.type) {
          // NOTE: External changes are NOT received via WebSocket.
          // They are detected via Vite HMR in useViteHMR hook.
          // See 03-INTERFACES.md "External Change Detection" section.

          case 'transform-result':
            if (message.success) {
              get().markEditCommitted(message.requestId);
            } else {
              get().markEditFailed(message.requestId, message.error);
            }
            break;
        }
      };

      set({ wsClient: ws });
    },

    disconnect() {
      get().wsClient?.close();
      set({ wsConnected: false, wsClient: null });
    },

    selectElement(domElement: HTMLElement, target: ElementTarget) {
      set({
        selectedElement: {
          target,
          domElement,
          computedStyles: window.getComputedStyle(domElement),
          bounds: domElement.getBoundingClientRect(),
        },
        hoveredElement: null, // Clear hover on select
      });
    },

    hoverElement(target: ElementTarget, bounds: DOMRect) {
      if (get().isTextEditing) return; // Don't hover while editing
      set({ hoveredElement: { target, bounds } });
    },

    clearHover() {
      set({ hoveredElement: null });
    },

    clearSelection() {
      set({ selectedElement: null });
    },

    updateStyle(property: string, value: StyleValue) {
      const { selectedElement, wsClient, undoStack, maxStackSize } = get();
      if (!selectedElement || !wsClient) return;

      const editId = crypto.randomUUID();

      // Get previous typed value from authored styles
      const previousValue = selectedElement.authoredStyles.get(property);

      // 1. Create command for undo (stores typed values for reversibility)
      const command: Command = {
        id: editId,
        type: 'update-style',
        target: selectedElement.target,
        before: previousValue ?? null,  // Typed StyleValue
        after: value,                   // Typed StyleValue
        timestamp: Date.now(),
      };

      // 2. Update undo stack (clear redo on new action)
      const newUndoStack = [...undoStack, command].slice(-maxStackSize);

      // 3. Track pending edit (show loading indicator)
      // NOTE: No optimistic DOM update for MVP - wait for Vite HMR
      const pending: PendingEdit = {
        id: editId,
        target: selectedElement.target,
        property,
        value,  // Typed StyleValue
        status: 'pending',
      };

      set(state => ({
        undoStack: newUndoStack,
        redoStack: [], // Clear redo on new action
        pendingEdits: new Map(state.pendingEdits).set(editId, pending),
      }));

      // 4. Send typed value to server (validated on server side)
      // Vite HMR will update DOM when server writes file
      wsClient.send(JSON.stringify({
        action: 'transform',
        id: editId,
        type: 'css-update',
        target: selectedElement.target,
        change: { property, value },  // Typed StyleValue
      }));
    },

    undo() {
      const { undoStack, redoStack, wsClient, maxStackSize } = get();
      if (undoStack.length === 0 || !wsClient) return;

      const command = undoStack[undoStack.length - 1];

      // For style commands, before/after are typed StyleValues
      if (command.type === 'update-style') {
        const styleCmd = command as { before: StyleValue | null; after: StyleValue; property: string };

        // Send to server - Vite HMR will update DOM
        wsClient.send(JSON.stringify({
          action: 'transform',
          id: crypto.randomUUID(),
          type: 'css-update',
          target: command.target,
          change: { property: styleCmd.property, value: styleCmd.before },
        }));
      }

      set({
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, command].slice(-maxStackSize),
      });
    },

    redo() {
      const { undoStack, redoStack, wsClient, maxStackSize } = get();
      if (redoStack.length === 0 || !wsClient) return;

      const command = redoStack[redoStack.length - 1];

      // For style commands, before/after are typed StyleValues
      if (command.type === 'update-style') {
        const styleCmd = command as { before: StyleValue | null; after: StyleValue; property: string };

        // Send to server - Vite HMR will update DOM
        wsClient.send(JSON.stringify({
          action: 'transform',
          id: crypto.randomUUID(),
          type: 'css-update',
          target: command.target,
          change: { property: styleCmd.property, value: styleCmd.after },
        }));
      }

      set({
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, command].slice(-maxStackSize),
      });
    },

    // Called by useViteHMR hook when Vite detects file changes
    // NOT called via WebSocket - see 03-INTERFACES.md "External Change Detection"
    clearPendingEditsForFile(file: string) {
      const { pendingEdits } = get();

      const newPending = new Map(pendingEdits);
      for (const [id, edit] of newPending) {
        if (edit.target.file === file) {
          newPending.delete(id);
        }
      }

      set({ pendingEdits: newPending });
    },

    clearUndoRedoForFile(file: string) {
      const { undoStack, redoStack } = get();

      set({
        undoStack: undoStack.filter(cmd => cmd.target.file !== file),
        redoStack: redoStack.filter(cmd => cmd.target.file !== file),
      });
    },

    refreshSelectedElement() {
      const { selectedElement } = get();
      if (!selectedElement) return;

      // Re-read computed styles after HMR updates DOM
      set({
        selectedElement: {
          ...selectedElement,
          computedStyles: window.getComputedStyle(selectedElement.domElement),
        },
      });
    },

    markEditCommitted(editId: string) {
      set(state => {
        const newPending = new Map(state.pendingEdits);
        const edit = newPending.get(editId);
        if (edit) {
          edit.status = 'committed';
          // Remove after short delay (for UI feedback)
          setTimeout(() => {
            set(s => {
              const p = new Map(s.pendingEdits);
              p.delete(editId);
              return { pendingEdits: p };
            });
          }, 1000);
        }
        return { pendingEdits: newPending };
      });
    },

    markEditFailed(editId: string, error: string) {
      // NOTE: No optimistic update to revert for MVP
      // Just remove from pending and show error
      const edit = get().pendingEdits.get(editId);
      if (edit) {
        console.error(`Edit failed: ${error}`);
      }

      set(state => {
        const newPending = new Map(state.pendingEdits);
        newPending.delete(editId);
        return { pendingEdits: newPending };
      });
    },

    // ... remaining actions (text editing, variants) follow same pattern
  }))
);
```

### 3.2 Module: `behaviors/registry.ts`

**EditorBehaviorsRegistry** - Defines how the editor responds to user interactions with different element types.

> **Note**: A "behavior" is an editor interaction (double-click to edit text), NOT runtime functionality (button submits form).
> See [01-ARCHITECTURE.md Decision 6](./01-ARCHITECTURE.md#decision-6-centralized-canvas--editorbehaviorsregistry) for rationale.

```typescript
// apps/builder/src/behaviors/registry.ts

/**
 * Element capabilities detected from DOM.
 */
interface ElementCapabilities {
  textEditable: boolean;    // h1, p, span, label, etc.
  imageReplaceable: boolean; // img
  resizable: boolean;        // block-level elements
  hasChildren: boolean;      // container elements
}

/**
 * Context passed to behavior handlers.
 */
interface BehaviorContext {
  element: HTMLElement;
  target: ElementTarget;
  capabilities: ElementCapabilities;
  store: EditorStore;
}

/**
 * Interface for editor behaviors.
 * Each behavior handles a specific type of editing interaction.
 */
interface EditorBehavior {
  /** Unique identifier (e.g., 'text-edit', 'image-replace') */
  id: string;

  /** Which elements does this behavior apply to? */
  appliesTo: (element: HTMLElement, capabilities: ElementCapabilities) => boolean;

  /** Event handlers */
  onDoubleClick?: (ctx: BehaviorContext) => void;
  onDragStart?: (ctx: BehaviorContext) => void;
  onDrag?: (ctx: BehaviorContext, delta: { x: number; y: number }) => void;
  onDragEnd?: (ctx: BehaviorContext) => void;
  onKeyDown?: (ctx: BehaviorContext, event: KeyboardEvent) => void;

  /** Overlay component to render when this behavior is active */
  Overlay?: React.ComponentType<{ element: HTMLElement; onClose: () => void }>;
}

/**
 * Registry for editor behaviors.
 * Behaviors register themselves on module load via imports.
 */
class EditorBehaviorsRegistry {
  private behaviors = new Map<string, EditorBehavior>();

  register(behavior: EditorBehavior): void {
    if (this.behaviors.has(behavior.id)) {
      throw new Error(`Behavior "${behavior.id}" already registered`);
    }
    this.behaviors.set(behavior.id, behavior);
  }

  /**
   * Find all behaviors that apply to an element.
   */
  getBehaviorsFor(element: HTMLElement, capabilities: ElementCapabilities): EditorBehavior[] {
    return Array.from(this.behaviors.values())
      .filter(b => b.appliesTo(element, capabilities));
  }

  /**
   * Get a specific behavior by ID.
   */
  get(id: string): EditorBehavior | undefined {
    return this.behaviors.get(id);
  }
}

export const editorBehaviorsRegistry = new EditorBehaviorsRegistry();

/**
 * Detect capabilities from a DOM element.
 */
export function detectCapabilities(element: HTMLElement): ElementCapabilities {
  const tagName = element.tagName.toUpperCase();
  const display = window.getComputedStyle(element).display;

  return {
    textEditable: ['H1','H2','H3','H4','H5','H6','P','SPAN','LABEL','A','LI','TD','TH'].includes(tagName),
    imageReplaceable: tagName === 'IMG',
    resizable: display === 'block' || display === 'flex' || display === 'grid',
    hasChildren: element.children.length > 0,
  };
}
```

### 3.3 Module: `behaviors/handlers/index.ts`

**Auto-registration** - import behaviors to register them.

```typescript
// apps/builder/src/behaviors/handlers/index.ts

// Each import triggers registration via side effect
import './text-edit';
import './image-replace';
import './resize';

// ─────────────────────────────────────────────────────────────
// TO ADD A NEW BEHAVIOR:
// 1. Create: apps/builder/src/behaviors/handlers/my-behavior.ts
// 2. Add import here: import './my-behavior';
// 3. Done! Canvas will automatically use it.
// ─────────────────────────────────────────────────────────────

export { editorBehaviorsRegistry, detectCapabilities } from '../registry';
```

### 3.4 Module: `behaviors/handlers/text-edit.ts`

**Example behavior** - registers itself with the registry on import.

```typescript
// apps/builder/src/behaviors/handlers/text-edit.ts
import { editorBehaviorsRegistry, EditorBehavior, BehaviorContext } from '../registry';

const textEditBehavior: EditorBehavior = {
  id: 'text-edit',

  appliesTo: (element, capabilities) => capabilities.textEditable,

  onDoubleClick: (ctx) => {
    const { element, store } = ctx;

    // Store original text for undo
    const originalText = element.textContent || '';

    // Enable inline editing
    element.contentEditable = 'true';
    element.focus();

    // Select all text
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Update store
    store.getState().startTextEditing(ctx.target, originalText);
  },

  onKeyDown: (ctx, event) => {
    if (event.key === 'Escape') {
      // Cancel editing, restore original
      ctx.store.getState().cancelTextEditing();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      // Commit change
      event.preventDefault();
      const newText = ctx.element.textContent || '';
      ctx.store.getState().commitTextEdit(newText);
    }
  },

  // Inline editing overlay (optional - could just use contentEditable)
  Overlay: undefined,
};

// Register on import
editorBehaviorsRegistry.register(textEditBehavior);
```

### 3.5 Component: `Canvas/Canvas.tsx`

Main canvas area. Handles **all** user interactions centrally, delegates to EditorBehaviorsRegistry.

```typescript
import { editorBehaviorsRegistry, detectCapabilities } from '../behaviors';

interface CanvasProps {
  children: React.ReactNode; // User's app components
}

export function Canvas({ children }: CanvasProps) {
  const {
    selectedElement,
    hoveredElement,
    previewMode,
    zoom,
    deviceMode,
    activeBehavior,
  } = useEditorStore();

  const canvasRef = useRef<HTMLDivElement>(null);

  // ─────────────────────────────────────────────────────────────
  // CENTRALIZED EVENT HANDLERS
  // All interactions go through here, then delegate to behaviors
  // ─────────────────────────────────────────────────────────────

  const getElementInfo = useCallback((target: HTMLElement) => {
    const element = target.closest('[oid]') as HTMLElement;
    if (!element) return null;

    const elementTarget: ElementTarget = {
      file: element.dataset.alaraFile!,
      lineNumber: parseInt(element.dataset.alaraLine!, 10),
      column: parseInt(element.dataset.alaraCol!, 10),
      cssFile: element.dataset.alaraCss!,
      selector: element.dataset.alaraSelector!,
    };

    const capabilities = detectCapabilities(element);

    return { element, target: elementTarget, capabilities };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (previewMode) return;
    e.preventDefault();  // Prevent button clicks, link navigation, etc.

    const info = getElementInfo(e.target as HTMLElement);
    if (info) {
      useEditorStore.getState().selectElement(info.element, info.target);
    }
  }, [previewMode, getElementInfo]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (previewMode) return;
    e.preventDefault();

    const info = getElementInfo(e.target as HTMLElement);
    if (!info) return;

    // Find behaviors that apply to this element
    const behaviors = editorBehaviorsRegistry.getBehaviorsFor(info.element, info.capabilities);

    // Execute first behavior with onDoubleClick handler
    const behavior = behaviors.find(b => b.onDoubleClick);
    if (behavior) {
      const ctx: BehaviorContext = {
        ...info,
        store: useEditorStore,
      };
      behavior.onDoubleClick!(ctx);
      useEditorStore.getState().setActiveBehavior(behavior.id);
    }
  }, [previewMode, getElementInfo]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (previewMode) return;

    const info = getElementInfo(e.target as HTMLElement);
    if (info) {
      const bounds = info.element.getBoundingClientRect();
      useEditorStore.getState().hoverElement(info.target, bounds);
    }
  }, [previewMode, getElementInfo]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!selectedElement || !activeBehavior) return;

    const behavior = editorBehaviorsRegistry.get(activeBehavior);
    if (behavior?.onKeyDown) {
      const ctx: BehaviorContext = {
        element: selectedElement.domElement,
        target: selectedElement.target,
        capabilities: detectCapabilities(selectedElement.domElement),
        store: useEditorStore,
      };
      behavior.onKeyDown(ctx, e.nativeEvent);
    }
  }, [selectedElement, activeBehavior]);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  const deviceWidth = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
  }[deviceMode];

  // Get active behavior's overlay component
  const ActiveOverlay = activeBehavior
    ? editorBehaviorsRegistry.get(activeBehavior)?.Overlay
    : null;

  return (
    <div
      ref={canvasRef}
      className={styles.canvas}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onKeyDown={handleKeyDown}
      tabIndex={0}  // Enable keyboard events
      style={{
        transform: `scale(${zoom / 100})`,
        transformOrigin: 'top left',
      }}
    >
      <div className={styles.deviceFrame} style={{ width: deviceWidth }}>
        {children}
      </div>

      {/* ─────────────────────────────────────────────────────────
          OVERLAYS: Rendered as siblings, NOT inside elements
          This avoids CSS interference with user's styles
          ───────────────────────────────────────────────────────── */}
      {!previewMode && (
        <>
          {hoveredElement && !selectedElement && (
            <HoverOverlay bounds={hoveredElement.bounds} />
          )}

          {selectedElement && (
            <SelectionOverlay
              bounds={selectedElement.bounds}
              element={selectedElement.domElement}
            />
          )}

          {/* Behavior-specific overlay (e.g., resize handles) */}
          {ActiveOverlay && selectedElement && (
            <ActiveOverlay
              element={selectedElement.domElement}
              onClose={() => useEditorStore.getState().setActiveBehavior(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
```

### 3.6 Component: `Canvas/overlays/SelectionOverlay.tsx`

**Selection overlay** - blue outline around selected element.

```typescript
interface SelectionOverlayProps {
  bounds: DOMRect;
  element: HTMLElement;
}

export function SelectionOverlay({ bounds, element }: SelectionOverlayProps) {
  // Position overlay absolutely based on element bounds
  const style: React.CSSProperties = {
    position: 'absolute',
    top: bounds.top,
    left: bounds.left,
    width: bounds.width,
    height: bounds.height,
    border: '2px solid #2196F3',
    pointerEvents: 'none',  // Click through to element
    zIndex: 9999,
  };

  return (
    <div className={styles.selectionOverlay} style={style}>
      {/* Element tag label */}
      <div className={styles.tagLabel}>
        {element.tagName.toLowerCase()}
        {element.className && `.${element.className.split(' ')[0]}`}
      </div>
    </div>
  );
}
```

### 3.7 Component: `Canvas/overlays/HoverOverlay.tsx`

**Hover overlay** - light highlight on mouse over.

```typescript
interface HoverOverlayProps {
  bounds: DOMRect;
}

export function HoverOverlay({ bounds }: HoverOverlayProps) {
  const style: React.CSSProperties = {
    position: 'absolute',
    top: bounds.top,
    left: bounds.left,
    width: bounds.width,
    height: bounds.height,
    border: '1px dashed #90CAF9',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    pointerEvents: 'none',
    zIndex: 9998,
  };

  return <div className={styles.hoverOverlay} style={style} />;
}
```

### 3.8 Component: `FloatingToolbox/FloatingToolbox.tsx`

Context-sensitive editing toolbox positioned near the selected element via Floating UI.

```typescript
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
} from '@floating-ui/react';

type ToolboxTabId = 'layout' | 'spacing' | 'colors' | 'typography' | 'border' | 'effects' | 'format';

interface FloatingToolboxProps {
  element: SelectedElement;
  referenceElement: HTMLElement | null;
}

export function FloatingToolbox({ element, referenceElement }: FloatingToolboxProps) {
  const activeTab = useEditorStore(state => state.activeToolboxTab);
  const setActiveTab = useEditorStore(state => state.setActiveToolboxTab);

  const { refs, floatingStyles, placement } = useFloating({
    placement: 'top',
    middleware: [
      offset(12),
      flip({ fallbackPlacements: ['bottom'], padding: 80 }),
      shift({ padding: 12 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    refs.setReference(referenceElement);
  }, [referenceElement, refs]);

  if (!referenceElement) return null;

  const tabs = getTabsForElement(element);

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className={styles.toolbox}
      data-placement={placement}
    >
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <TabContent activeTab={activeTab} element={element} />
    </div>
  );
}

// Tab configurations based on element type
function getTabsForElement(element: SelectedElement): ToolboxTabConfig[] {
  const tagName = element.domElement.tagName.toLowerCase();

  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a'].includes(tagName)) {
    return TEXT_TABS;  // Format, Colors, Typography, Spacing, Effects
  }
  if (['div', 'section', 'article', 'main'].includes(tagName)) {
    return CONTAINER_TABS;  // Layout, Spacing, Colors, Border, Effects
  }
  if (tagName === 'img') {
    return IMAGE_TABS;  // Size, Position, Border, Effects
  }
  return DEFAULT_TABS;  // Spacing, Colors, Effects
}
```

---

## 4. Runtime Package (`@alara/runtime`)

Injected into user's app during development.

### 4.1 Module: `vite-plugin.ts`

Vite plugin that **injects source location and CSS Module attributes** on every JSX element.
These attributes enable the backend to find the correct source files to edit.

**Key responsibilities**:
1. Inject unique `oid` attribute on every JSX element
2. **Resolve CSS Module imports** and store metadata in OID registry
3. Inject Alara client script with OID registry for WebSocket connection

> **Design Decision**: CSS file and selector are resolved at **build time** by tracing:
> `className={styles.button}` → `import styles from './Button.module.css'` → `cssFile` + `selector`
>
> This is more work upfront but ensures:
> - No runtime CSS file resolution needed
> - No ambiguity about which file to edit
> - Clear scope: only CSS Modules are editable (not global styles)

```typescript
import type { Plugin } from 'vite';
import { transformSync } from '@babel/core';

// OID registry populated during build, injected as global
const oidRegistry = new Map<string, {
  file: string;
  lineNumber: number;
  column: number;
  cssFile: string;
  selector: string;
}>();

export function alaraPlugin(): Plugin {
  return {
    name: 'alara-runtime',
    enforce: 'pre',

    transform(code: string, id: string) {
      // Only transform TSX/JSX in src/
      if (!id.includes('/src/') ||
          (!id.endsWith('.tsx') && !id.endsWith('.jsx'))) {
        return null;
      }

      // Skip node_modules
      if (id.includes('node_modules')) {
        return null;
      }

      // Use Babel to inject oid attribute on every JSX element
      // This transforms:
      //   import styles from './Button.module.css';
      //   <div className={styles.card}>
      // Into:
      //   <div className={styles.card} oid="card-12-4">
      //
      // And populates OID registry with:
      //   'card-12-4' → { file, lineNumber, column, cssFile, selector }
      const result = transformSync(code, {
        filename: id,
        plugins: [
          [require.resolve('./babel-plugin-alara'), {
            filename: id,
            oidRegistry,  // Babel plugin populates this
          }]
        ],
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
      });

      return result?.code ?? null;
    },

    transformIndexHtml(html: string) {
      // Inject Alara client script with OID registry
      const registryJson = JSON.stringify([...oidRegistry.entries()]);
      return html.replace(
        '</head>',
        `<script>window.__ALARA_OID_REGISTRY__=new Map(${registryJson})</script>
         <script type="module" src="/@alara/client"></script></head>`
      );
    },

    resolveId(id: string) {
      if (id === '/@alara/client') {
        return '\0@alara/client';
      }
    },

    load(id: string) {
      if (id === '\0@alara/client') {
        return `
          // Connect to Alara service
          const ws = new WebSocket('ws://localhost:4000/ws');
          ws.onopen = () => console.log('[Alara] Connected');
          window.__ALARA_WS__ = ws;
        `;
      }
    },
  };
}
```

### 4.2 Module: `babel-plugin-alara.ts`

Babel plugin that performs the actual AST transformation. Generates unique `oid` attributes and populates the OID registry.

> **BUILD-TIME RESOLUTION**: This plugin runs during `vite build` / `vite dev`, NOT at runtime.
> The CSS file path is resolved once when the file is compiled, stored in the OID registry.
> At runtime, the frontend reads `oid` and looks up metadata from registry - no CSS resolution needed.

**OID Generation Logic** (all at build time):
1. On file parse: collect all CSS Module imports (`import X from '*.module.css'`)
2. Build map: `importName` → `cssFilePath` (e.g., `styles` → `./Button.module.css`)
3. On each JSX element:
   - Generate unique `oid` from file + line + col (e.g., `btn-12-4`)
   - If has `className={X.Y}`, resolve CSS file and selector
   - Store full metadata in OID registry
   - Inject only `oid` attribute on DOM element

```typescript
import { declare } from '@babel/helper-plugin-utils';
import { types as t } from '@babel/core';
import path from 'path';

interface PluginState {
  filename: string;
  cssImports: Map<string, string>;  // BUILD-TIME map: importName → cssFilePath
  oidRegistry: Map<string, OidEntry>;  // Shared registry from Vite plugin
}

interface OidEntry {
  file: string;
  lineNumber: number;
  column: number;
  cssFile: string;
  selector: string;
}

export default declare((api) => {
  api.assertVersion(7);

  return {
    name: 'babel-plugin-alara',

    visitor: {
      // Step 1: Collect CSS Module imports
      ImportDeclaration(path, state: PluginState) {
        const source = path.node.source.value;

        // Only track CSS Module imports
        if (!source.endsWith('.module.css')) return;

        const specifier = path.node.specifiers[0];
        if (specifier?.type === 'ImportDefaultSpecifier') {
          const importName = specifier.local.name;  // e.g., 'styles'

          // Resolve relative path to absolute
          const cssFilePath = resolveCssPath(state.filename, source);
          state.cssImports.set(importName, cssFilePath);
        }
      },

      // Step 2: Generate oid and populate registry for each JSX element
      JSXOpeningElement(path, state: PluginState) {
        const { node } = path;
        const loc = node.loc?.start;
        if (!loc) return;

        // Generate unique oid from file basename + line + col
        const basename = state.filename.split('/').pop()?.replace(/\.[^.]+$/, '') || 'el';
        const oid = `${basename}-${loc.line}-${loc.column}`;

        // Try to resolve CSS Module from className
        const classNameAttr = node.attributes.find(
          (attr): attr is t.JSXAttribute =>
            t.isJSXAttribute(attr) && attr.name.name === 'className'
        );

        let cssFile = '';
        let selector = '';

        if (classNameAttr) {
          const cssInfo = extractCssInfo(classNameAttr, state.cssImports);
          if (cssInfo) {
            cssFile = cssInfo.cssFile;
            selector = cssInfo.selector;
          }
        }

        // Store full metadata in OID registry
        state.oidRegistry.set(oid, {
          file: state.filename,
          lineNumber: loc.line,
          column: loc.column,
          cssFile,
          selector,
        });

        // Inject only oid attribute on element
        node.attributes.push(createAttr('oid', oid));
      },
    },

    pre(state: PluginState) {
      // Initialize CSS imports map for this file
      state.cssImports = new Map();
    },
  };
});

/**
 * Extract CSS file and selector from className attribute.
 * Handles: className={styles.button}
 * Returns: { cssFile: 'src/Button.module.css', selector: '.button' }
 */
function extractCssInfo(
  attr: t.JSXAttribute,
  cssImports: Map<string, string>
): { cssFile: string; selector: string } | null {
  const value = attr.value;

  // Handle: className={styles.button}
  if (t.isJSXExpressionContainer(value)) {
    const expr = value.expression;

    // Simple case: styles.button
    if (t.isMemberExpression(expr) &&
        t.isIdentifier(expr.object) &&
        t.isIdentifier(expr.property)) {
      const importName = expr.object.name;    // 'styles'
      const className = expr.property.name;   // 'button'

      const cssFile = cssImports.get(importName);
      if (cssFile) {
        return {
          cssFile,
          selector: `.${className}`,
        };
      }
    }

    // TODO: Handle template literals: `${styles.button} ${styles.large}`
    // For now, only first class is tracked
  }

  return null;
}

function createAttr(name: string, value: string): t.JSXAttribute {
  return t.jsxAttribute(
    t.jsxIdentifier(name),
    t.stringLiteral(value)
  );
}

function resolveCssPath(tsxFile: string, cssImport: string): string {
  // Convert relative import to project-relative path
  const dir = path.dirname(tsxFile);
  return path.join(dir, cssImport);
}
```

**Limitations** (documented scope):
- Only tracks single CSS Module per element (first `styles.X` wins)
- Template literals with multiple classes: only first class tracked
- Global CSS imports (without `.module.css`) are ignored
- Inline styles are handled separately (not through this plugin)

### 4.3 Module: `EditorWrapper.tsx`

Wrapper component for **runtime selection context**.

**Separation of concerns**:
- **`oid` attribute**: Single ID injected on JSX elements by Vite plugin. Full metadata stored in OID registry.
- **EditorWrapper**: Provides runtime context for selection/hover overlays and visual editing features.

```typescript
import { useRef, useEffect, type ReactNode } from 'react';

interface EditorWrapperProps {
  children: ReactNode;
}

/**
 * EditorWrapper provides runtime context for visual editing.
 * - Tracks mounted/unmounted state for selection validity
 * - Handles focus management for text editing
 * - Does NOT inject source location attributes (Vite plugin does that)
 */
export function EditorWrapper({ children }: EditorWrapperProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Register with Alara runtime for selection tracking
    const element = ref.current;
    if (element) {
      window.__ALARA_ELEMENTS__?.add(element);
      return () => window.__ALARA_ELEMENTS__?.delete(element);
    }
  }, []);

  return (
    <div
      ref={ref}
      oid="wrapper"
      style={{ display: 'contents' }} // Don't affect layout
    >
      {children}
    </div>
  );
}
```

---

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              @alara/cli                                  │
│                         (bunx alara dev)                                │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ imports
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            @alara/service                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐   │
│  │ server.ts   │→ │ ws/handler  │→ │TransformEng │→ │ FileWatcher   │   │
│  └─────────────┘  └─────────────┘  └──────┬──────┘  └───────────────┘   │
│                                           │                              │
│       ┌───────────────────────────────────┼───────────────────────┐     │
│       ▼                   ▼               ▼                       ▼     │
│  ┌─────────────┐   ┌─────────────┐  ┌─────────────┐        ┌──────────┐ │
│  │CSSTransform │   │JSXTransform │  │TextTransform│        │ CSSCache │ │
│  │  (PostCSS)  │   │ (ts-morph)  │  │             │        │ (10 max) │ │
│  └─────────────┘   └─────────────┘  └─────────────┘        └──────────┘ │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        Transaction                               │    │
│  │            (atomic file operations with rollback)                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                    ▲                                      │
                    │ WebSocket                            │ serves static
                    │                                      ▼
┌───────────────────┴─────────────────────────────────────────────────────┐
│                            @alara/builder                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐   │
│  │ App.tsx     │→ │ Canvas      │→ │ Properties  │→ │ Toolbar       │   │
│  └─────────────┘  └─────────────┘  │   Panel     │  └───────────────┘   │
│                                    └─────────────┘                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     editorStore (Zustand)                        │    │
│  │  selection │ pendingEdits │ undoStack │ wsConnection             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ renders user's app with
                                    │
┌───────────────────────────────────┴─────────────────────────────────────┐
│                           @alara/runtime                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ vite-plugin.ts  │→ │ EditorWrapper   │→ │ babel-plugin-alara      │  │
│  │                 │  │     .tsx        │  │ (injects wrappers)      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions for Next Document

1. **Interface Definitions (03)**: Need to define exact WebSocket message types, API request/response schemas
2. **Data Design (04)**: Need to specify Zustand store shape in more detail, AST node caching strategy
3. ~~**Algorithms (05)**: Need to detail element re-matching algorithm when lines shift~~ → **Resolved**: Build-time attribute injection eliminates need for re-matching. See [05-ALGORITHMS.md](./05-ALGORITHMS.md)
