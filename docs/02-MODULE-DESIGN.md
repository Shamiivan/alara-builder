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

## 3. Client Package (`@alara/client`)

Vanilla JavaScript/TypeScript package injected into the user's running app. Provides selection, text editing, overlays, and WebSocket connection to the Alara service. **No React dependency**.

### 3.1 Module: `store.ts`

Vanilla Zustand store (no React hooks). Uses `createStore` from `zustand/vanilla`.

```typescript
// packages/client/src/store.ts
import { createStore } from 'zustand/vanilla';
import type { ElementTarget } from '@alara/core/shared';

export interface SelectedElement {
  element: HTMLElement;
  target: ElementTarget | null;
  bounds: DOMRect;
}

export interface TextEditState {
  isEditing: boolean;
  element: HTMLElement | null;
  originalText: string;
  oid: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface EditorState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  wsClient: WebSocket | null;
  selectedElement: SelectedElement | null;
  hoveredElement: { element: HTMLElement; bounds: DOMRect } | null;
  textEdit: TextEditState;
  pendingEdits: Map<string, PendingEdit>;
}

export function createEditorStore() {
  return createStore<EditorState & EditorActions>((set, get) => ({
    // Initial state
    connectionStatus: 'disconnected',
    connectionError: null,
    wsClient: null,
    selectedElement: null,
    hoveredElement: null,
    textEdit: { isEditing: false, element: null, originalText: '', oid: '' },
    pendingEdits: new Map(),

    // Actions
    selectElement: (element, target) => {
      const bounds = element.getBoundingClientRect();
      set({ selectedElement: { element, target, bounds } });
    },

    clearSelection: () => set({ selectedElement: null }),

    hoverElement: (element) => {
      const bounds = element.getBoundingClientRect();
      set({ hoveredElement: { element, bounds } });
    },

    clearHover: () => set({ hoveredElement: null }),

    startTextEditing: (element, originalText, oid) => {
      set({ textEdit: { isEditing: true, element, originalText, oid } });
    },

    commitTextEdit: (newText) => {
      const { textEdit, selectedElement, wsClient } = get();
      if (!textEdit.isEditing || !selectedElement?.target) return;

      if (newText !== textEdit.originalText && wsClient?.readyState === WebSocket.OPEN) {
        wsClient.send(JSON.stringify({
          action: 'transform',
          type: 'text-update',
          target: selectedElement.target,
          change: { originalText: textEdit.originalText, newText },
        }));
      }

      set({ textEdit: { isEditing: false, element: null, originalText: '', oid: '' } });
    },

    cancelTextEditing: () => {
      const { textEdit } = get();
      if (textEdit.element) {
        textEdit.element.textContent = textEdit.originalText;
      }
      set({ textEdit: { isEditing: false, element: null, originalText: '', oid: '' } });
    },
  }));
}
```

### 3.2 Module: `behaviors/registry.ts`

**EditorBehaviorsRegistry** - Defines how the editor responds to user interactions with different element types.

> **Note**: A "behavior" is an editor interaction (double-click to edit text), NOT runtime functionality (button submits form).

```typescript
// packages/client/src/behaviors/registry.ts

export interface BehaviorContext {
  selectElement: (element: HTMLElement, target: ElementTarget | null) => void;
  clearSelection: () => void;
  startTextEditing: (element: HTMLElement, originalText: string, oid: string) => void;
  commitTextEdit: (newText: string) => void;
  cancelTextEditing: () => void;
  getTextEditState: () => TextEditState;
}

export interface EditorBehavior {
  id: string;
  name: string;
  priority?: number;

  appliesTo: (element: HTMLElement) => boolean;

  onClick?: (element: HTMLElement, event: MouseEvent, ctx: BehaviorContext) => void;
  onDoubleClick?: (element: HTMLElement, event: MouseEvent, ctx: BehaviorContext) => void;
  onKeyDown?: (element: HTMLElement, event: KeyboardEvent, ctx: BehaviorContext) => void;
  onBlur?: (element: HTMLElement, event: FocusEvent, ctx: BehaviorContext) => void;
}

class EditorBehaviorsRegistry {
  private behaviors: EditorBehavior[] = [];

  register(behavior: EditorBehavior): void {
    this.behaviors.push(behavior);
    this.behaviors.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  getBehaviorsForElement(element: HTMLElement): EditorBehavior[] {
    return this.behaviors.filter((b) => b.appliesTo(element));
  }

  getPrimaryBehavior(element: HTMLElement): EditorBehavior | undefined {
    return this.behaviors.find((b) => b.appliesTo(element));
  }
}

export const editorBehaviorsRegistry = new EditorBehaviorsRegistry();

export const TEXT_EDITABLE_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'a',
  'li', 'td', 'th', 'figcaption', 'caption', 'blockquote', 'cite', 'q',
];

export function isTextEditableElement(element: HTMLElement): boolean {
  return TEXT_EDITABLE_TAGS.includes(element.tagName.toLowerCase());
}
```

### 3.3 Module: `behaviors/handlers/text-edit.ts`

**Text edit behavior** - registers itself with the registry on import.

```typescript
// packages/client/src/behaviors/handlers/text-edit.ts
import { editorBehaviorsRegistry, isTextEditableElement, type EditorBehavior } from '../registry';

const textEditBehavior: EditorBehavior = {
  id: 'text-edit',
  name: 'Text Edit',
  priority: 10,

  appliesTo: (element) => isTextEditableElement(element),

  onDoubleClick(element, event, ctx) {
    event.preventDefault();
    event.stopPropagation();

    const oid = element.getAttribute('oid') ?? '';
    const originalText = element.textContent ?? '';

    element.contentEditable = 'true';
    element.focus();

    // Select all text
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    ctx.startTextEditing(element, originalText, oid);
  },

  onKeyDown(element, event, ctx) {
    const { isEditing, element: editingElement } = ctx.getTextEditState();
    if (!isEditing || editingElement !== element) return;

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      element.contentEditable = 'false';
      ctx.commitTextEdit(element.textContent ?? '');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      element.contentEditable = 'false';
      ctx.cancelTextEditing();
    }
  },

  onBlur(element, _event, ctx) {
    const { isEditing, element: editingElement } = ctx.getTextEditState();
    if (!isEditing || editingElement !== element) return;

    queueMicrotask(() => {
      const state = ctx.getTextEditState();
      if (state.isEditing && state.element === element) {
        element.contentEditable = 'false';
        ctx.commitTextEdit(element.textContent ?? '');
      }
    });
  },
};

editorBehaviorsRegistry.register(textEditBehavior);
```

### 3.4 Module: `selection.ts`

Document-level event handlers for selection and hover.

```typescript
// packages/client/src/selection.ts
import { parseOid } from '@alara/core/shared';
import type { EditorStore } from './store';
import { editorBehaviorsRegistry } from './behaviors/registry';

function findEditableElement(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('[oid]') as HTMLElement | null;
}

export function attachSelectionHandlers(store: EditorStore): () => void {
  const abortController = new AbortController();
  const { signal } = abortController;

  const handleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-alara-overlay]')) return;
    if (store.getState().textEdit.isEditing) return;

    const element = findEditableElement(e.target);
    if (element) {
      e.preventDefault();
      const oid = element.getAttribute('oid');
      const target = oid ? parseOid(oid) : null;
      store.getState().selectElement(element, target);
    } else {
      store.getState().clearSelection();
    }
  };

  const handleDoubleClick = (e: MouseEvent) => {
    const element = findEditableElement(e.target);
    if (!element) return;

    const behavior = editorBehaviorsRegistry.getPrimaryBehavior(element);
    if (behavior?.onDoubleClick) {
      behavior.onDoubleClick(element, e, createBehaviorContext(store));
    }
  };

  document.addEventListener('click', handleClick, { capture: true, signal });
  document.addEventListener('dblclick', handleDoubleClick, { capture: true, signal });

  return () => abortController.abort();
}
```

### 3.5 Module: `overlays.ts`

DOM-based overlay rendering (no React).

```typescript
// packages/client/src/overlays.ts
import type { EditorStore } from './store';

export function renderOverlays(store: EditorStore): () => void {
  // Create container
  const container = document.createElement('div');
  container.id = 'alara-overlays';
  container.setAttribute('data-alara-overlay', 'true');
  container.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';

  // Create selection box
  const selection = document.createElement('div');
  selection.style.cssText = `
    position:fixed;pointer-events:none;display:none;
    border:2px solid #2196F3;background:rgba(33,150,243,0.1);
  `;
  container.appendChild(selection);

  // Create hover box
  const hover = document.createElement('div');
  hover.style.cssText = `
    position:fixed;pointer-events:none;display:none;
    border:1px dashed #90CAF9;background:rgba(33,150,243,0.05);
  `;
  container.appendChild(hover);

  document.body.appendChild(container);

  // Subscribe to store changes
  const unsubscribe = store.subscribe((state) => {
    const { selectedElement, hoveredElement, textEdit } = state;

    // Update selection overlay
    if (selectedElement && !textEdit.isEditing) {
      const { bounds } = selectedElement;
      selection.style.display = 'block';
      selection.style.top = `${bounds.top}px`;
      selection.style.left = `${bounds.left}px`;
      selection.style.width = `${bounds.width}px`;
      selection.style.height = `${bounds.height}px`;
    } else {
      selection.style.display = 'none';
    }

    // Update hover overlay
    if (hoveredElement && hoveredElement.element !== selectedElement?.element && !textEdit.isEditing) {
      const { bounds } = hoveredElement;
      hover.style.display = 'block';
      hover.style.top = `${bounds.top}px`;
      hover.style.left = `${bounds.left}px`;
      hover.style.width = `${bounds.width}px`;
      hover.style.height = `${bounds.height}px`;
    } else {
      hover.style.display = 'none';
    }
  });

  return () => {
    unsubscribe();
    container.remove();
  };
}
```

### 3.6 Module: `websocket.ts`

WebSocket connection with reconnection and error handling.

```typescript
// packages/client/src/websocket.ts
import type { EditorStore } from './store';

export function connectWebSocket(store: EditorStore, url: string): () => void {
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;

  function connect() {
    store.getState().setConnectionStatus('connecting');

    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      store.getState().setWebSocket(ws);
      store.getState().setConnectionStatus('connected');
    };

    ws.onclose = () => {
      store.getState().setWebSocket(null);
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        store.getState().setConnectionStatus('disconnected');
        setTimeout(() => {
          reconnectAttempts++;
          connect();
        }, Math.min(1000 * Math.pow(2, reconnectAttempts), 10000));
      } else {
        store.getState().setConnectionStatus('error', 'Unable to connect');
      }
    };
  }

  connect();

  return () => {
    ws?.close();
    store.getState().setConnectionStatus('disconnected');
  };
}
```

### 3.7 Module: `index.ts`

Entry point that initializes the client.

```typescript
// packages/client/src/index.ts
import { createEditorStore } from './store';
import { attachSelectionHandlers } from './selection';
import { attachTextEditHandlers } from './text-editing';
import { renderOverlays } from './overlays';
import { connectWebSocket } from './websocket';

// Import behaviors to register them
import './behaviors/handlers/text-edit';

export interface AlaraClientOptions {
  port?: number;
}

export function initAlaraClient(options: AlaraClientOptions = {}) {
  const port = options.port ?? 4000;
  const store = createEditorStore();

  const cleanupFns = [
    connectWebSocket(store, `ws://localhost:${port}/ws`),
    attachSelectionHandlers(store),
    attachTextEditHandlers(store),
    renderOverlays(store),
  ];

  console.log('[Alara] Client initialized');

  return {
    store,
    destroy: () => cleanupFns.forEach((fn) => fn()),
  };
}
```

---

## 4. Buildtime Package (`@alara/buildtime`)

Vite plugin that injects `@alara/client` into the user's app during development.

### 4.1 Module: `vite-plugin.ts`

Vite plugin that:
1. Transforms JSX via Babel to inject `oid` attributes for element identification
2. Injects `@alara/client` via transformIndexHtml to enable visual editing

```typescript
// packages/buildtime/src/vite-plugin.ts
import type { Plugin } from 'vite';
import { transformSync } from '@babel/core';
import { babelPluginOid } from './babel-plugin-oid';

export interface AlaraPluginOptions {
  serverPort?: number;  // Default: 4000
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
      if (!id.includes('/src/') || (!id.endsWith('.tsx') && !id.endsWith('.jsx'))) {
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
        parserOpts: { plugins: ['jsx', 'typescript'] },
        sourceMaps: true,
      });

      return result?.code ? { code: result.code, map: result.map } : null;
    },

    // Inject Alara client script into HTML
    transformIndexHtml(html: string) {
      return {
        html,
        tags: [{ tag: 'script', attrs: { type: 'module', src: VIRTUAL_CLIENT_ID }, injectTo: 'head' }],
      };
    },

    resolveId(id: string) {
      if (id === VIRTUAL_CLIENT_ID) return RESOLVED_VIRTUAL_CLIENT_ID;
    },

    load(id: string) {
      if (id === RESOLVED_VIRTUAL_CLIENT_ID) {
        return `
import { initAlaraClient } from '@alara/client';
initAlaraClient({ port: ${serverPort} });
`;
      }
    },
  };
}
```

### 4.2 Module: `babel-plugin-oid.ts`

Babel plugin that injects `oid` attributes on every JSX element for source location tracking.

```typescript
// packages/buildtime/src/babel-plugin-oid.ts
import { declare } from '@babel/helper-plugin-utils';
import { types as t } from '@babel/core';
import path from 'path';

interface PluginOptions {
  root: string;  // Project root directory
}

export const babelPluginOid = declare((api, options: PluginOptions) => {
  api.assertVersion(7);

  return {
    name: 'babel-plugin-oid',

    visitor: {
      JSXOpeningElement(nodePath, state) {
        const { node } = nodePath;
        const loc = node.loc?.start;
        if (!loc) return;

        // Get relative file path
        const filename = state.filename ?? '';
        const relativePath = path.relative(options.root, filename);

        // Generate oid: "src/components/Button.tsx:12:4"
        const oid = `${relativePath}:${loc.line}:${loc.column}`;

        // Inject oid attribute
        node.attributes.push(
          t.jsxAttribute(t.jsxIdentifier('oid'), t.stringLiteral(oid))
        );
      },
    },
  };
});
```

**Note**: The Babel plugin currently only injects `oid` attributes. CSS Module resolution (`css` attribute) is planned for a future iteration.

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
                           ▲
                           │ WebSocket
                           │
┌──────────────────────────┴──────────────────────────────────────────────┐
│                     User's Vite App (dev mode)                           │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  User's React/Vue/etc. Components with oid attributes injected    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                           ▲                                              │
│                           │ injected by                                  │
│  ┌────────────────────────┴──────────────────────────────────────────┐  │
│  │                  @alara/client (Vanilla JS)                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │  │
│  │  │ selection   │  │ text-edit   │  │ overlays    │                │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘                │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │           editorStore (Vanilla Zustand)                      │  │  │
│  │  │  selection │ textEdit │ connectionStatus │ wsClient          │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                           ▲                                              │
│                           │ imports                                      │
│  ┌────────────────────────┴──────────────────────────────────────────┐  │
│  │                  @alara/buildtime (Vite Plugin)                    │  │
│  │  ┌─────────────────┐  ┌─────────────────────────────────────────┐ │  │
│  │  │ vite-plugin.ts  │→ │ babel-plugin-oid (injects oid attrs)    │ │  │
│  │  └─────────────────┘  └─────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Open Questions for Next Document

1. **Interface Definitions (03)**: Need to define exact WebSocket message types, API request/response schemas
2. **Data Design (04)**: Need to specify Zustand store shape in more detail, AST node caching strategy
3. ~~**Algorithms (05)**: Need to detail element re-matching algorithm when lines shift~~ → **Resolved**: Build-time attribute injection eliminates need for re-matching. See [05-ALGORITHMS.md](./05-ALGORITHMS.md)
