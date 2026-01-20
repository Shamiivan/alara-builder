# 09 - Testing Strategy

This document defines the testing approach, test cases, and testing infrastructure for Alara Builder.

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Testing Stack](#2-testing-stack)
3. [Test Structure](#3-test-structure)
4. [Unit Tests](#4-unit-tests)
5. [Integration Tests](#5-integration-tests)
6. [End-to-End Tests](#6-end-to-end-tests)
7. [Test Fixtures & Mocks](#7-test-fixtures--mocks)
8. [Critical Test Cases](#8-critical-test-cases)
9. [CI/CD Integration](#9-cicd-integration)

---

## 1. Testing Philosophy

### 1.1 Testing Pyramid

```
                    ┌─────────┐
                    │   E2E   │  Few, slow, high confidence
                    │  Tests  │  (Playwright)
                   ─┴─────────┴─
                  ┌─────────────┐
                  │ Integration │  Medium count, medium speed
                  │    Tests    │  (Vitest + real modules)
                 ─┴─────────────┴─
                ┌─────────────────┐
                │    Unit Tests   │  Many, fast, isolated
                │                 │  (Vitest)
               ─┴─────────────────┴─
```

### 1.2 Guiding Principles

1. **Test Behavior, Not Implementation** - Test what the code does, not how it does it
2. **Fast Feedback** - Unit tests should run in <5 seconds
3. **Realistic Fixtures** - Use real CSS/JSX files as test fixtures
4. **Isolation** - Each test should be independent
5. **Coverage Targets**:
   - Unit tests: 80%+ coverage
   - Critical paths: 100% coverage (transforms, undo/redo)

### 1.3 What to Test

| Priority | Component | Why |
|----------|-----------|-----|
| **Critical** | CSS Transformer | Core functionality, must preserve formatting |
| **Critical** | JSX Transformer | Core functionality, must not break code |
| **Critical** | Transaction/Rollback | Data integrity |
| **Critical** | Undo/Redo | User experience |
| **High** | WebSocket Protocol | API contract |
| **High** | Zod Schemas | Runtime validation |
| **High** | Element Matching | Selection reliability |
| **Medium** | Store Actions | State management |
| **Medium** | UI Components | User interaction |
| **Low** | CLI Commands | Simple wrappers |

---

## 2. Testing Stack

### 2.1 Tools

| Tool | Purpose | Package |
|------|---------|---------|
| **Vitest** | Unit & integration tests | `vitest` |
| **Playwright** | E2E browser tests | `@playwright/test` |
| **Testing Library** | React component tests | `@testing-library/react` |
| **MSW** | Mock WebSocket/HTTP | `msw` |
| **Zod** | Schema validation in tests | `zod` |

### 2.2 Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/**/*.d.ts',
        'src/**/index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    setupFiles: ['./test/setup.ts'],
  },
});
```

```typescript
// vitest.config.browser.ts (for Builder UI tests)
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.tsx'],
    setupFiles: ['./test/setup-dom.ts'],
  },
});
```

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:4000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  webServer: {
    command: 'bun run dev',
    port: 4000,
    reuseExistingServer: !process.env.CI,
  },
});
```

### 2.3 Test Scripts

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:ui": "vitest --config vitest.config.browser.ts",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "vitest run && playwright test"
  }
}
```

---

## 3. Test Structure

### 3.1 Directory Layout

```
packages/
├── core/                                 # Business logic (Open/Closed)
│   ├── src/
│   │   ├── transforms/
│   │   │   ├── registry.ts
│   │   │   ├── registry.test.ts         # Registry unit tests
│   │   │   └── handlers/                # ← Add new transforms here
│   │   │       ├── index.ts
│   │   │       ├── css-update.ts
│   │   │       ├── css-update.test.ts   # Unit tests alongside handler
│   │   │       ├── text-update.ts
│   │   │       ├── text-update.test.ts
│   │   │       └── add-variant.ts
│   │   └── ...
│   └── ...
│
├── service/
│   ├── src/
│   │   ├── engine/
│   │   │   └── TransformEngine.ts       # Delegates to registry
│   │   ├── api/
│   │   │   └── handlers/                # WebSocket handlers (Open/Closed)
│   │   │       ├── transform.ts
│   │   │       └── transform.test.ts
│   │   └── ...
│   ├── test/
│   │   ├── setup.ts                      # Test setup/globals
│   │   ├── fixtures/                     # Test fixture files
│   │   │   ├── css/
│   │   │   │   ├── button.module.css
│   │   │   │   ├── with-variables.module.css
│   │   │   │   └── malformed.css
│   │   │   └── jsx/
│   │   │       ├── Button.tsx
│   │   │       ├── WithVariants.tsx
│   │   │       └── ComplexComponent.tsx
│   │   ├── mocks/
│   │   │   ├── websocket.ts
│   │   │   └── filesystem.ts
│   │   └── integration/                  # Integration tests
│   │       ├── transform-flow.test.ts
│   │       └── file-watcher.test.ts
│   └── vitest.config.ts
│
├── builder/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Canvas/
│   │   │   │   ├── Canvas.tsx
│   │   │   │   └── Canvas.test.tsx
│   │   │   └── FloatingToolbox/
│   │   │       ├── SpacingPanel.tsx
│   │   │       └── SpacingPanel.test.tsx
│   │   └── store/
│   │       ├── editorStore.ts
│   │       └── editorStore.test.ts
│   └── test/
│       ├── setup-dom.ts
│       └── fixtures/
│
├── core/
│   └── src/
│       └── shared/                      # Shared contracts
│           ├── css-values.ts
│           ├── css-values.test.ts
│           ├── transforms.ts
│           └── transforms.test.ts
│
└── e2e/                                  # End-to-end tests
    ├── fixtures/
    │   └── test-project/                 # Sample React project
    │       ├── src/
    │       │   └── components/
    │       ├── package.json
    │       └── vite.config.ts
    ├── visual-editing.spec.ts
    ├── undo-redo.spec.ts
    ├── variant-creation.spec.ts
    └── external-changes.spec.ts
```

### 3.2 Test Naming Conventions

```typescript
// Unit test file: [module].test.ts
// Integration test: [feature]-flow.test.ts
// E2E test: [feature].spec.ts

// Test naming pattern
describe('ModuleName', () => {
  describe('methodName', () => {
    it('should [expected behavior] when [condition]', () => {});
    it('should throw [error] when [invalid condition]', () => {});
  });
});
```

---

## 4. Unit Tests

### 4.1 CSS Update Handler Tests

```typescript
// core/src/transforms/handlers/css-update.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { transformRegistry } from '../registry';
import { CSSCache } from '../../cache/CSSCache';
import { Transaction } from '../../Transaction';
import { readFixture, createTestContext } from '../../../test/helpers';

// Import handler to register it
import './css-update';

describe('css-update handler', () => {
  let ctx: TransformContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  describe('execute', () => {
    it('should update an existing CSS property value', async () => {
      // Setup: load fixture into cache
      const css = readFixture('css/button.module.css');
      await ctx.cssCache.set('button.module.css', postcss.parse(css));

      await transformRegistry.execute({
        type: 'css-update',
        id: 'test-1',
        target: {
          file: 'Button.tsx',
          lineNumber: 10,
          column: 4,
          cssFile: 'button.module.css',
          selector: '.button',
        },
        change: {
          property: 'padding',
          computedValue: { type: 'unit', value: 12, unit: 'px' },
          newValue: { type: 'unit', value: 16, unit: 'px' },
        },
      }, ctx);

      const result = ctx.transaction.getQueuedWrite('button.module.css');
      expect(result).toContain('padding: 16px');
    });

    it('should preserve CSS comments', async () => {
      const css = `
        /* Primary button styles */
        .button {
          padding: 12px;
        }
      `;
      await ctx.cssCache.set('test.css', postcss.parse(css));

      await transformRegistry.execute({
        type: 'css-update',
        id: 'test-2',
        target: { file: 'Test.tsx', lineNumber: 1, column: 1, cssFile: 'test.css', selector: '.button' },
        change: { property: 'padding', computedValue: { type: 'unit', value: 12, unit: 'px' }, newValue: { type: 'unit', value: 16, unit: 'px' } },
      }, ctx);

      const result = ctx.transaction.getQueuedWrite('test.css');
      expect(result).toContain('/* Primary button styles */');
    });

    it('should throw when selector not found', async () => {
      const css = `.button { padding: 12px; }`;
      await ctx.cssCache.set('test.css', postcss.parse(css));

      await expect(
        transformRegistry.execute({
          type: 'css-update',
          id: 'test-3',
          target: { file: 'Test.tsx', lineNumber: 1, column: 1, cssFile: 'test.css', selector: '.nonexistent' },
          change: { property: 'padding', computedValue: { type: 'unit', value: 12, unit: 'px' }, newValue: { type: 'unit', value: 16, unit: 'px' } },
        }, ctx)
      ).rejects.toThrow('SELECTOR_NOT_FOUND');
    });
  });
});
```

### 4.2 Add Variant Handler Tests

```typescript
// core/src/transforms/handlers/add-variant.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { transformRegistry } from '../registry';
import { createTestContext } from '../../../test/helpers';
import postcss from 'postcss';

// Import handler to register it
import './add-variant';

describe('add-variant handler', () => {
  let ctx: TransformContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it('should create a new variant class', async () => {
    const css = `.button { padding: 12px; }`;
    await ctx.cssCache.set('button.module.css', postcss.parse(css));

    await transformRegistry.execute({
      type: 'add-variant',
      id: 'test-1',
      target: { file: 'Button.tsx', lineNumber: 10, column: 4, selector: '.button' },
      change: {
        variantName: 'large',
        cssFile: 'button.module.css',
        styles: {
          padding: { type: 'unit', value: 20, unit: 'px' },
          'font-size': { type: 'unit', value: 18, unit: 'px' },
        },
      },
    }, ctx);

    const result = ctx.transaction.getQueuedWrite('button.module.css');
    expect(result).toContain('.large {');
    expect(result).toContain('padding: 20px');
    expect(result).toContain('font-size: 18px');
  });

  it('should throw VARIANT_ALREADY_EXISTS if class exists', async () => {
    const css = `.button { padding: 12px; }\n.large { padding: 20px; }`;
    await ctx.cssCache.set('button.module.css', postcss.parse(css));

    await expect(
      transformRegistry.execute({
        type: 'add-variant',
        id: 'test-2',
        target: { file: 'Button.tsx', lineNumber: 10, column: 4, selector: '.button' },
        change: {
          variantName: 'large',
          cssFile: 'button.module.css',
          styles: { padding: { type: 'unit', value: 24, unit: 'px' } },
        },
      }, ctx)
    ).rejects.toThrow('VARIANT_ALREADY_EXISTS');
  });
});
```

### 4.3 Transform Registry Tests

```typescript
// core/src/transforms/registry.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TransformRegistry, TransformHandler } from './registry';
import { z } from 'zod';

describe('TransformRegistry', () => {
  let registry: TransformRegistry;

  beforeEach(() => {
    registry = new TransformRegistry();
  });

  it('should register and execute handlers', async () => {
    const handler: TransformHandler<{ type: 'test' }> = {
      type: 'test',
      schema: z.object({ type: z.literal('test') }),
      execute: vi.fn().mockResolvedValue(undefined),
    };

    registry.register(handler);
    await registry.execute({ type: 'test' }, createTestContext());

    expect(handler.execute).toHaveBeenCalled();
  });

  it('should throw for unknown handler type', async () => {
    await expect(
      registry.execute({ type: 'unknown' }, createTestContext())
    ).rejects.toThrow('Unknown transform type: unknown');
  });

  it('should validate requests with Zod schema', async () => {
    const handler: TransformHandler<{ type: 'test'; value: number }> = {
      type: 'test',
      schema: z.object({ type: z.literal('test'), value: z.number() }),
      execute: vi.fn(),
    };

    registry.register(handler);

    await expect(
      registry.execute({ type: 'test', value: 'invalid' } as any, createTestContext())
    ).rejects.toThrow(); // Zod validation error
  });

  it('should list registered handler types', () => {
    registry.register({ type: 'a', schema: z.any(), execute: vi.fn() });
    registry.register({ type: 'b', schema: z.any(), execute: vi.fn() });

    expect(registry.getTypes()).toEqual(['a', 'b']);
  });
});
```

### 4.4 CSS Utilities Tests

```typescript
// core/src/css/value-utils.test.ts
import { describe, it, expect } from 'vitest';
import { findRule, getDeclaration } from './utils';
import postcss from 'postcss';

describe('CSS Utilities', () => {
  describe('findRule', () => {
    it('should find rule by exact selector', () => {
      const css = `.button { padding: 12px; }`;
      const root = postcss.parse(css);
      const result = findRule(root, '.button');
      expect(result).not.toBeNull();
    });

    it('should handle CSS Modules hashed selectors', () => {
      // CSS Modules transforms .button to .Button_button__abc123
      // But our selector lookup should still work with .button
      const css = `.Button_button__abc123 { padding: 12px; }`;
      const root = postcss.parse(css);
      const result = findRule(root, '.button');
      // Implementation should have logic to match partial names
      expect(result).not.toBeNull();
    });
  });
});
```

### 4.5 JSX Utilities Tests

```typescript
// core/src/jsx/utils.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { addClassName, findElementAtLine, mergeClassName } from './utils';
import { Project, SourceFile } from 'ts-morph';

describe('JSX Utilities', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
  });

  function createSourceFile(code: string): SourceFile {
    return project.createSourceFile('test.tsx', code, { overwrite: true });
  }

  describe('addClassName', () => {
    it('should convert simple className to template literal', () => {
      const sourceFile = createSourceFile(`
        import styles from './Button.module.css';
        export function Button() {
          return <button className={styles.button}>Click</button>;
        }
      `);

      const element = findElementAtLine(sourceFile, 4);
      addClassName(element!, 'styles.large');

      expect(sourceFile.getFullText()).toContain('className={`${styles.button} ${styles.large}`}');
    });

    it('should add to existing template literal', () => {
      const sourceFile = createSourceFile(`
        import styles from './Button.module.css';
        export function Button() {
          return <button className={\`\${styles.button}\`}>Click</button>;
        }
      `);

      const element = findElementAtLine(sourceFile, 4);
      addClassName(element!, 'styles.large');

      expect(sourceFile.getFullText()).toContain('${styles.large}');
    });

    it('should preserve other props', () => {
      const sourceFile = createSourceFile(`
        export function Button() {
          return <button className={styles.button} onClick={handleClick} disabled>Click</button>;
        }
      `);

      const element = findElementAtLine(sourceFile, 3);
      addClassName(element!, 'styles.large');

      const result = sourceFile.getFullText();
      expect(result).toContain('onClick={handleClick}');
      expect(result).toContain('disabled');
    });
  });

  describe('findElementAtLine', () => {
    it('should find JSX element at specified line', () => {
      const sourceFile = createSourceFile(`
        function App() {
          return (
            <div>
              <button>Click</button>
            </div>
          );
        }
      `);

      const element = findElementAtLine(sourceFile, 5);
      expect(element).not.toBeNull();
      expect(element?.getTagNameNode().getText()).toBe('button');
    });

    it('should find self-closing element', () => {
      const sourceFile = createSourceFile(`
        function App() {
          return <input type="text" />;
        }
      `);

      const element = findElementAtLine(sourceFile, 3);
      expect(element).not.toBeNull();
    });

    it('should return null when line has no JSX', () => {
      const sourceFile = createSourceFile(`
        const x = 1;
        const y = 2;
      `);

      const element = findElementAtLine(sourceFile, 2);
      expect(element).toBeNull();
    });
  });

  describe('mergeClassName', () => {
    it('should merge two class expressions', () => {
      const result = mergeClassName('styles.button', 'styles.large');
      expect(result).toBe('`${styles.button} ${styles.large}`');
    });
  });
});
```

### 4.6 Text Update Handler Tests

```typescript
// core/src/transforms/handlers/text-update.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { transformRegistry } from '../registry';
import { createTestContext } from '../../../test/helpers';
import { Project } from 'ts-morph';

// Import handler to register it
import './text-update';

describe('text-update handler', () => {
  let ctx: TransformContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  describe('execute', () => {
    it('should replace text content in JSX', async () => {
      const jsx = `
        function Button() {
          return <button>Click me</button>;
        }
      `;
      // JSX is not cached - create source file in project for test
      ctx.project.createSourceFile('test.tsx', jsx, { overwrite: true });

      await transformRegistry.execute({
        type: 'text-update',
        id: 'test-1',
        target: { file: 'test.tsx', lineNumber: 3, column: 18, selector: '' },
        change: {
          originalText: 'Click me',
          newText: 'Submit',
        },
      }, ctx);

      const result = ctx.transaction.getQueuedWrite('test.tsx');
      expect(result).toContain('>Submit<');
      expect(result).not.toContain('Click me');
    });

    it('should handle text with leading/trailing whitespace', async () => {
      const jsx = `
        function Button() {
          return <button>
            Click me
          </button>;
        }
      `;
      // JSX is not cached - create source file in project for test
      ctx.project.createSourceFile('test.tsx', jsx, { overwrite: true });

      await transformRegistry.execute({
        type: 'text-update',
        id: 'test-2',
        target: { file: 'test.tsx', lineNumber: 4, column: 1, selector: '' },
        change: { originalText: 'Click me', newText: 'Submit' },
      }, ctx);

      const result = ctx.transaction.getQueuedWrite('test.tsx');
      expect(result).toContain('Submit');
    });

    it('should throw TEXT_NOT_FOUND when text does not exist', async () => {
      const jsx = `
        function Button() {
          return <button>Click me</button>;
        }
      `;
      // JSX is not cached - create source file in project for test
      ctx.project.createSourceFile('test.tsx', jsx, { overwrite: true });

      await expect(
        transformRegistry.execute({
          type: 'text-update',
          id: 'test-3',
          target: { file: 'test.tsx', lineNumber: 3, column: 1, selector: '' },
          change: { originalText: 'Nonexistent', newText: 'Submit' },
        }, ctx)
      ).rejects.toThrow('TEXT_NOT_FOUND');
    });

    it('should handle special characters in text', async () => {
      const jsx = `
        function Price() {
          return <span>$99.99</span>;
        }
      `;
      // JSX is not cached - create source file in project for test
      ctx.project.createSourceFile('test.tsx', jsx, { overwrite: true });

      await transformRegistry.execute({
        type: 'text-update',
        id: 'test-4',
        target: { file: 'test.tsx', lineNumber: 3, column: 1, selector: '' },
        change: { originalText: '$99.99', newText: '$149.99' },
      }, ctx);

      const result = ctx.transaction.getQueuedWrite('test.tsx');
      expect(result).toContain('$149.99');
    });
  });
});
```

### 4.7 Transaction Tests

```typescript
// service/src/engine/Transaction.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Transaction } from './Transaction';
import * as fs from 'fs/promises';

vi.mock('fs/promises');

describe('Transaction', () => {
  let transaction: Transaction;

  beforeEach(() => {
    transaction = new Transaction();
    vi.clearAllMocks();
  });

  describe('queueWrite', () => {
    it('should queue a file write', () => {
      transaction.queueWrite('test.css', '.button { color: red; }');

      const queued = transaction.getQueuedWrite('test.css');
      expect(queued).toBe('.button { color: red; }');
    });

    it('should overwrite previous queued write for same file', () => {
      transaction.queueWrite('test.css', 'first');
      transaction.queueWrite('test.css', 'second');

      const queued = transaction.getQueuedWrite('test.css');
      expect(queued).toBe('second');
    });
  });

  describe('commit', () => {
    it('should write all queued files', async () => {
      const mockWrite = vi.mocked(Bun.write);
      mockWrite.mockResolvedValue(undefined);

      transaction.queueWrite('file1.css', 'content1');
      transaction.queueWrite('file2.tsx', 'content2');

      await transaction.commit();

      expect(mockWrite).toHaveBeenCalledTimes(2);
      expect(mockWrite).toHaveBeenCalledWith('file1.css', 'content1');
      expect(mockWrite).toHaveBeenCalledWith('file2.tsx', 'content2');
    });

    it('should clear queued writes after commit', async () => {
      transaction.queueWrite('test.css', 'content');
      await transaction.commit();

      expect(transaction.getQueuedWrite('test.css')).toBeUndefined();
    });
  });

  describe('rollback', () => {
    it('should restore files from backups', async () => {
      const mockWrite = vi.mocked(Bun.write);
      mockWrite.mockResolvedValue(undefined);

      // Simulate backup creation
      transaction.backup('test.css', 'property', 'original-value');
      transaction.queueWrite('test.css', 'new-content');

      await transaction.rollback();

      // Should restore original content
      expect(mockWrite).toHaveBeenCalled();
    });

    it('should clear all state after rollback', async () => {
      transaction.backup('test.css', 'property', 'value');
      transaction.queueWrite('test.css', 'content');

      await transaction.rollback();

      expect(transaction.getQueuedWrite('test.css')).toBeUndefined();
    });
  });
});
```

### 4.8 Zod Schema Tests

```typescript
// core/src/shared/transforms.test.ts
import { describe, it, expect } from 'vitest';
import {
  ElementTargetSchema,
  TransformRequestSchema,
  TransformTypeSchema,
  CSSChangeSchema,
  AddVariantChangeSchema,
} from './transform';

describe('Transform Schemas', () => {
  describe('ElementTargetSchema', () => {
    it('should validate valid element target', () => {
      const target = {
        file: 'src/components/Button.tsx',
        lineNumber: 12,
        column: 5,
        cssFile: 'src/components/Button.module.css',
        selector: '.button',
      };

      const result = ElementTargetSchema.safeParse(target);
      expect(result.success).toBe(true);
    });

    it('should reject invalid file extension', () => {
      const target = {
        file: 'src/components/Button.css',
        lineNumber: 12,
        column: 5,
        cssFile: 'src/components/Button.module.css',
        selector: '.button',
      };

      const result = ElementTargetSchema.safeParse(target);
      expect(result.success).toBe(false);
    });

    it('should reject negative line number', () => {
      const target = {
        file: 'src/components/Button.tsx',
        lineNumber: -1,
        column: 5,
        cssFile: 'src/components/Button.module.css',
        selector: '.button',
      };

      const result = ElementTargetSchema.safeParse(target);
      expect(result.success).toBe(false);
    });

    it('should reject selector without dot', () => {
      const target = {
        file: 'src/components/Button.tsx',
        lineNumber: 12,
        column: 5,
        cssFile: 'src/components/Button.module.css',
        selector: 'button',  // Missing dot
      };

      const result = ElementTargetSchema.safeParse(target);
      expect(result.success).toBe(false);
    });

    it('should reject non-module CSS file', () => {
      const target = {
        file: 'src/components/Button.tsx',
        lineNumber: 12,
        column: 5,
        cssFile: 'src/styles/global.css',  // Not a CSS Module
        selector: '.button',
      };

      const result = ElementTargetSchema.safeParse(target);
      expect(result.success).toBe(false);
    });
  });

  describe('AddVariantChangeSchema', () => {
    it('should validate valid variant change', () => {
      const change = {
        variantName: 'large',
        cssFile: 'src/components/Button.module.css',
        styles: {
          padding: '20px',
          'font-size': '18px',
        },
      };

      const result = AddVariantChangeSchema.safeParse(change);
      expect(result.success).toBe(true);
    });

    it('should reject invalid CSS class name', () => {
      const change = {
        variantName: '123invalid',  // Can't start with number
        cssFile: 'src/components/Button.module.css',
        styles: { padding: '20px' },
      };

      const result = AddVariantChangeSchema.safeParse(change);
      expect(result.success).toBe(false);
    });

    it('should reject non-module CSS file', () => {
      const change = {
        variantName: 'large',
        cssFile: 'src/styles/global.css',  // Not a module
        styles: { padding: '20px' },
      };

      const result = AddVariantChangeSchema.safeParse(change);
      expect(result.success).toBe(false);
    });

    it('should reject empty styles', () => {
      const change = {
        variantName: 'large',
        cssFile: 'src/components/Button.module.css',
        styles: {},  // Empty
      };

      const result = AddVariantChangeSchema.safeParse(change);
      expect(result.success).toBe(false);
    });
  });

  describe('TransformRequestSchema', () => {
    it('should validate complete transform request', () => {
      const request = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        type: 'css-update',
        target: {
          file: 'src/components/Button.tsx',
          lineNumber: 12,
          column: 5,
          cssFile: 'src/components/Button.module.css',
          selector: '.button',
        },
        change: {
          property: 'padding',
          value: '16px',
        },
      };

      const result = TransformRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });
});
```

### 4.9 Store Tests

```typescript
// builder/src/store/editorStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEditorStore } from './editorStore';
import { act } from '@testing-library/react';

describe('EditorStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useEditorStore.setState({
      selectedElement: null,
      hoveredElement: null,
      pendingEdits: new Map(),
      undoStack: [],
      redoStack: [],
    });
  });

  describe('selection', () => {
    it('should select an element', () => {
      const mockElement = document.createElement('button');
      const target = {
        file: 'src/Button.tsx',
        lineNumber: 12,
        column: 5,
        cssFile: 'src/Button.module.css',
        selector: '.button',
      };

      act(() => {
        useEditorStore.getState().selectElement(mockElement, target);
      });

      const state = useEditorStore.getState();
      expect(state.selectedElement).not.toBeNull();
      expect(state.selectedElement?.target).toEqual(target);
    });

    it('should clear hover when selecting', () => {
      const mockElement = document.createElement('button');
      const target = {
        file: 'src/Button.tsx',
        lineNumber: 12,
        column: 5,
        cssFile: 'src/Button.module.css',
        selector: '.button',
      };

      // Set hover first
      useEditorStore.setState({
        hoveredElement: { target, bounds: new DOMRect() },
      });

      act(() => {
        useEditorStore.getState().selectElement(mockElement, target);
      });

      expect(useEditorStore.getState().hoveredElement).toBeNull();
    });
  });

  describe('undo/redo', () => {
    it('should push command to undo stack', () => {
      const command = {
        id: 'cmd-1',
        type: 'update-style' as const,
        target: {
          file: 'src/Button.tsx',
          lineNumber: 12,
          column: 5,
          cssFile: 'src/Button.module.css',
          selector: '.button',
        },
        before: { property: 'padding', value: '12px' },
        after: { property: 'padding', value: '16px' },
        timestamp: Date.now(),
      };

      act(() => {
        useEditorStore.getState().pushCommand(command);
      });

      const state = useEditorStore.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0]).toEqual(command);
    });

    it('should clear redo stack on new command', () => {
      // Setup: add something to redo stack
      useEditorStore.setState({
        redoStack: [{
          id: 'old-cmd',
          type: 'update-style',
          target: {} as any,
          before: {},
          after: {},
          timestamp: Date.now(),
        }],
      });

      const newCommand = {
        id: 'new-cmd',
        type: 'update-style' as const,
        target: {} as any,
        before: {},
        after: {},
        timestamp: Date.now(),
      };

      act(() => {
        useEditorStore.getState().pushCommand(newCommand);
      });

      expect(useEditorStore.getState().redoStack).toHaveLength(0);
    });

    it('should move command from undo to redo on undo', () => {
      const command = {
        id: 'cmd-1',
        type: 'update-style' as const,
        target: {} as any,
        before: { property: 'padding', value: '12px' },
        after: { property: 'padding', value: '16px' },
        timestamp: Date.now(),
      };

      // Mock WebSocket
      const mockWs = { send: vi.fn() };
      useEditorStore.setState({
        wsClient: mockWs as any,
        undoStack: [command],
      });

      act(() => {
        useEditorStore.getState().undo();
      });

      const state = useEditorStore.getState();
      expect(state.undoStack).toHaveLength(0);
      expect(state.redoStack).toHaveLength(1);
    });

    it('should respect maxStackSize', () => {
      useEditorStore.setState({ maxStackSize: 3 });

      for (let i = 0; i < 5; i++) {
        act(() => {
          useEditorStore.getState().pushCommand({
            id: `cmd-${i}`,
            type: 'update-style',
            target: {} as any,
            before: {},
            after: {},
            timestamp: Date.now(),
          });
        });
      }

      expect(useEditorStore.getState().undoStack).toHaveLength(3);
    });
  });

  // External changes are detected via Vite HMR, not WebSocket
  // These tests verify the store actions called by useViteHMR hook
  describe('external changes (via Vite HMR)', () => {
    it('should clear pending edits for changed file', () => {
      const pendingEdits = new Map([
        ['edit-1', {
          id: 'edit-1',
          target: { file: 'src/Button.tsx', lineNumber: 12, column: 5, cssFile: 'src/Button.module.css', selector: '.button' },
          type: 'css-update' as const,
          change: { property: 'padding', value: '16px' },
          status: 'pending' as const,
          timestamp: Date.now(),
        }],
      ]);

      useEditorStore.setState({ pendingEdits });

      act(() => {
        // Called by useViteHMR when vite:beforeUpdate fires
        useEditorStore.getState().clearPendingEditsForFile('src/Button.tsx');
      });

      expect(useEditorStore.getState().pendingEdits.size).toBe(0);
    });

    it('should clear undo/redo for changed file', () => {
      const command = {
        id: 'cmd-1',
        type: 'update-style' as const,
        target: { file: 'src/Button.tsx', lineNumber: 12, column: 5, cssFile: 'src/Button.module.css', selector: '.button' },
        before: {},
        after: {},
        timestamp: Date.now(),
      };

      useEditorStore.setState({
        undoStack: [command],
        redoStack: [command],
      });

      act(() => {
        // Called by useViteHMR when vite:beforeUpdate fires
        useEditorStore.getState().clearUndoRedoForFile('src/Button.tsx');
      });

      const state = useEditorStore.getState();
      expect(state.undoStack).toHaveLength(0);
      expect(state.redoStack).toHaveLength(0);
    });
  });
});
```

---

## 5. Integration Tests

### 5.1 Transform Flow Integration

```typescript
// service/test/integration/transform-flow.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer } from '../../src/server';
import { WebSocket } from 'ws';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

describe('Transform Flow Integration', () => {
  const TEST_DIR = join(__dirname, '../fixtures/temp-project');
  let server: ReturnType<typeof createServer>;
  let ws: WebSocket;

  beforeAll(async () => {
    // Create test project structure
    await mkdir(join(TEST_DIR, 'src/components'), { recursive: true });
    await writeFile(
      join(TEST_DIR, 'src/components/Button.module.css'),
      '.button { padding: 12px; color: blue; }'
    );
    await writeFile(
      join(TEST_DIR, 'src/components/Button.tsx'),
      `import styles from './Button.module.css';
export function Button() {
  return <button className={styles.button}>Click</button>;
}`
    );

    server = createServer({
      port: 4001,
      projectDir: TEST_DIR,
      staticDir: join(__dirname, '../../static'),
    });
  });

  afterAll(async () => {
    server.stop();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    ws = new WebSocket('ws://localhost:4001/ws');
    await new Promise(resolve => ws.on('open', resolve));
  });

  afterEach(() => {
    ws.close();
  });

  it('should update CSS property and return success', async () => {
    const request = {
      action: 'transform',
      id: 'test-001',
      type: 'css-update',
      target: {
        file: 'src/components/Button.tsx',
        lineNumber: 3,
        column: 10,
        cssFile: 'src/components/Button.module.css',
        selector: '.button',
      },
      change: {
        property: 'padding',
        value: '16px',
      },
    };

    const response = await sendAndReceive(ws, request);

    expect(response.type).toBe('transform-result');
    expect(response.success).toBe(true);
    expect(response.affectedFiles).toContain('src/components/Button.module.css');

    // Verify file was actually modified
    const cssContent = await Bun.file(join(TEST_DIR, 'src/components/Button.module.css')).text();
    expect(cssContent).toContain('padding: 16px');
  });

  it('should create variant and update JSX', async () => {
    const request = {
      action: 'transform',
      id: 'test-002',
      type: 'add-variant',
      target: {
        file: 'src/components/Button.tsx',
        lineNumber: 3,
        column: 10,
        cssFile: 'src/components/Button.module.css',
        selector: '.button',
      },
      change: {
        variantName: 'large',
        styles: {
          padding: '20px',
          'font-size': '18px',
        },
      },
    };

    const response = await sendAndReceive(ws, request);

    expect(response.success).toBe(true);

    // Verify CSS has new class
    const cssContent = await Bun.file(join(TEST_DIR, 'src/components/Button.module.css')).text();
    expect(cssContent).toContain('.large');
    expect(cssContent).toContain('padding: 20px');

    // Verify JSX was updated
    const jsxContent = await Bun.file(join(TEST_DIR, 'src/components/Button.tsx')).text();
    expect(jsxContent).toContain('styles.large');
  });

  it('should rollback on failure', async () => {
    // First, get original content
    const originalCss = await Bun.file(join(TEST_DIR, 'src/components/Button.module.css')).text();

    // Send request that will fail (invalid JSX line)
    const request = {
      action: 'transform',
      id: 'test-003',
      type: 'add-variant',
      target: {
        file: 'src/components/Button.tsx',
        lineNumber: 999,  // Invalid line
        column: 10,
        cssFile: 'src/components/Button.module.css',
        selector: '.button',
      },
      change: {
        variantName: 'newvariant',
        styles: { padding: '30px' },
      },
    };

    const response = await sendAndReceive(ws, request);

    expect(response.success).toBe(false);

    // Verify CSS was not modified (rollback worked)
    const cssContent = await Bun.file(join(TEST_DIR, 'src/components/Button.module.css')).text();
    expect(cssContent).not.toContain('.newvariant');
  });
});

// Helper function
function sendAndReceive(ws: WebSocket, request: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);

    ws.once('message', (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });

    ws.send(JSON.stringify(request));
  });
}
```

### 5.2 File Watcher Integration

```typescript
// service/test/integration/file-watcher.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FileWatcher } from '../../src/watcher/FileWatcher';
import { TransformEngine } from '../../src/engine/TransformEngine';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

describe('FileWatcher Integration', () => {
  const TEST_DIR = join(__dirname, '../fixtures/temp-watcher');
  let watcher: FileWatcher;
  let engine: TransformEngine;

  beforeAll(async () => {
    await mkdir(join(TEST_DIR, 'src'), { recursive: true });
    await writeFile(join(TEST_DIR, 'src/test.css'), '.button { color: red; }');

    engine = new TransformEngine(TEST_DIR);
    watcher = new FileWatcher(TEST_DIR, engine);
  });

  afterAll(async () => {
    watcher.stop();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should invalidate AST cache when file is modified', async () => {
    // FileWatcher now only invalidates cache; external changes
    // are detected by browser via Vite HMR (not WebSocket)

    // Pre-populate cache
    await engine.getStylesForElement({
      file: 'src/test.tsx',
      lineNumber: 1,
      column: 5,
      cssFile: 'src/test.module.css',
      selector: '.button',
    });
    expect(engine.cache.has('src/test.module.css')).toBe(true);

    // Modify the file
    await writeFile(join(TEST_DIR, 'src/test.css'), '.button { color: blue; }');

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 200));

    // Cache should be invalidated
    expect(engine.cache.has('src/test.module.css')).toBe(false);
  });

  it('should invalidate cache on file change', async () => {
    const filePath = join(TEST_DIR, 'src/test.css');

    // Populate cache
    await engine.getStylesForElement({
      file: 'src/test.tsx',
      lineNumber: 1,
      column: 5,
      cssFile: 'src/test.module.css',
      selector: '.button',
    });

    // Modify file
    await writeFile(filePath, '.button { color: green; }');

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 200));

    // Cache should be invalidated
    // (Implementation detail: check if cache miss on next access)
  });

  it('should debounce rapid changes', async () => {
    const changes: any[] = [];
    const unsubscribe = watcher.subscribe(change => changes.push(change));

    // Rapid modifications
    for (let i = 0; i < 5; i++) {
      await writeFile(join(TEST_DIR, 'src/test.css'), `.button { color: color${i}; }`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    // Wait for debounce to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Should have fewer events than modifications due to debouncing
    expect(changes.length).toBeLessThan(5);

    unsubscribe();
  });
});
```

### 5.3 WebSocket Protocol Testing

Alara uses a **WebSocket-only architecture** for all runtime operations. This section covers testing all message types.

#### Test Helper Module

Create a reusable WebSocket test client:

```typescript
// service/test/utils/ws-test-client.ts
import { WebSocket } from 'ws';

export class TestWSClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, {
    resolve: (msg: any) => void;
    reject: (err: Error) => void;
  }>();
  private messageId = 0;

  async connect(url: string = 'ws://localhost:4001/ws'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (data) => this.handleMessage(data));
    });
  }

  private handleMessage(data: Buffer): void {
    const msg = JSON.parse(data.toString());
    const pending = this.pending.get(msg.requestId);
    if (pending) {
      this.pending.delete(msg.requestId);
      pending.resolve(msg);
    }
  }

  async send<T>(action: string, payload: object = {}, timeout = 5000): Promise<T> {
    if (!this.ws) throw new Error('Not connected');

    const id = `test-${++this.messageId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${action}`));
      }, timeout);

      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject,
      });

      this.ws!.send(JSON.stringify({ action, id, ...payload }));
    });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
```

#### Testing All Message Types

```typescript
// service/test/integration/ws-protocol.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { TestWSClient } from '../utils/ws-test-client';
import { createServer } from '../../src/server';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

describe('WebSocket Protocol', () => {
  const TEST_DIR = join(__dirname, '../fixtures/temp-ws-test');
  let server: ReturnType<typeof createServer>;
  let client: TestWSClient;

  beforeAll(async () => {
    // Create test project
    await mkdir(join(TEST_DIR, 'src/components'), { recursive: true });
    await writeFile(
      join(TEST_DIR, 'src/components/Button.module.css'),
      '.button { padding: 12px; color: blue; }'
    );
    await writeFile(
      join(TEST_DIR, 'src/components/Button.tsx'),
      `import styles from './Button.module.css';
export function Button() {
  return <button className={styles.button}>Click</button>;
}`
    );

    server = createServer({ port: 4001, projectDir: TEST_DIR });
  });

  afterAll(async () => {
    server.stop();
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(async () => {
    client = new TestWSClient();
    await client.connect();
  });

  afterEach(() => {
    client.close();
  });

  // --- get-project ---
  describe('get-project', () => {
    it('should return project metadata', async () => {
      const response = await client.send('get-project');

      expect(response.type).toBe('project');
      expect(response.root).toBe(TEST_DIR);
      expect(response.components).toBeDefined();
      expect(Array.isArray(response.components)).toBe(true);
    });
  });

  // NOTE: get-styles action was removed
  // Computed styles are read from browser via getComputedStyle(), not from server
  // Client sends computedValue + newValue in transform requests

  // --- get-variants ---
  describe('get-variants', () => {
    it('should return variants for CSS file', async () => {
      const response = await client.send('get-variants', {
        cssFile: 'src/components/Button.module.css',
      });

      expect(response.type).toBe('variants');
      expect(response.baseClass).toBeDefined();
      expect(Array.isArray(response.variants)).toBe(true);
    });
  });

  // --- preview ---
  describe('preview', () => {
    it('should return preview without applying changes', async () => {
      const response = await client.send('preview', {
        type: 'css-update',
        target: {
          file: 'src/components/Button.tsx',
          lineNumber: 3,
          cssFile: 'src/components/Button.module.css',
          selector: '.button',
        },
        change: {
          property: 'padding',
          computedValue: { type: 'unit', value: 12, unit: 'px' },
          newValue: { type: 'unit', value: 24, unit: 'px' },
        },
      });

      expect(response.type).toBe('preview-result');
      expect(response.valid).toBe(true);
      expect(response.preview[0].before).toContain('12px');
      expect(response.preview[0].after).toContain('24px');

      // Verify file was NOT modified
      const cssContent = await Bun.file(join(TEST_DIR, 'src/components/Button.module.css')).text();
      expect(cssContent).toContain('12px');
      expect(cssContent).not.toContain('24px');
    });

    it('should return invalid preview for bad request', async () => {
      const response = await client.send('preview', {
        type: 'css-update',
        target: {
          file: 'src/components/NonExistent.tsx',
          lineNumber: 1,
          selector: '.button',
        },
        change: {
          property: 'padding',
          value: { type: 'unit', value: 24, unit: 'px' },
        },
      });

      expect(response.type).toBe('preview-result');
      expect(response.valid).toBe(false);
    });
  });

  // --- transform ---
  describe('transform', () => {
    it('should apply CSS update', async () => {
      const response = await client.send('transform', {
        type: 'css-update',
        target: {
          file: 'src/components/Button.tsx',
          lineNumber: 3,
          selector: '.button',
        },
        change: {
          property: 'color',
          value: { type: 'keyword', value: 'red' },
        },
      });

      expect(response.type).toBe('transform-result');
      expect(response.success).toBe(true);

      // Verify file was modified
      const cssContent = await Bun.file(join(TEST_DIR, 'src/components/Button.module.css')).text();
      expect(cssContent).toContain('color: red');
    });
  });

  // --- ping/pong ---
  describe('ping', () => {
    it('should respond with pong', async () => {
      const response = await client.send('ping');

      expect(response.type).toBe('pong');
      expect(response.serverTime).toBeDefined();
    });
  });
});
```

#### CLI Tools for Manual Testing

For manual/interactive testing, use CLI tools:

```bash
# wscat (npm install -g wscat)
wscat -c ws://localhost:4000/ws

# Then send JSON messages:
{"action":"ping","id":"1"}
{"action":"get-project","id":"2"}
{"action":"get-variants","id":"3","cssFile":"src/Button.module.css"}

# websocat (more powerful, available via cargo or brew)
echo '{"action":"ping","id":"1"}' | websocat ws://localhost:4000/ws
```

---

## 6. End-to-End Tests

### 6.1 Visual Editing E2E

```typescript
// e2e/visual-editing.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForSelector('[data-testid="canvas"]');
  });

  test('should select element on click', async ({ page }) => {
    // Click on a button in the canvas
    await page.click('[oid]');

    // Selection overlay should appear
    await expect(page.locator('[data-testid="selection-overlay"]')).toBeVisible();

    // Properties panel should show element info
    await expect(page.locator('[data-testid="properties-panel"]')).toContainText('button');
  });

  test('should show hover overlay on mouseover', async ({ page }) => {
    // Hover over an element
    await page.hover('[oid]');

    // Hover overlay should appear
    await expect(page.locator('[data-testid="hover-overlay"]')).toBeVisible();

    // Move away
    await page.hover('body');

    // Hover overlay should disappear
    await expect(page.locator('[data-testid="hover-overlay"]')).not.toBeVisible();
  });

  test('should update padding via properties panel', async ({ page }) => {
    // Select element
    await page.click('[oid]');

    // Find padding input in properties panel
    const paddingInput = page.locator('[data-testid="spacing-padding-top"]');

    // Clear and type new value
    await paddingInput.clear();
    await paddingInput.fill('20px');
    await paddingInput.press('Enter');

    // Wait for update to be applied
    await page.waitForTimeout(500);

    // Verify the element's padding changed
    const button = page.locator('[oid]');
    const padding = await button.evaluate(el => getComputedStyle(el).paddingTop);
    expect(padding).toBe('20px');
  });

  test('should update text via double-click', async ({ page }) => {
    // Double-click to edit text
    await page.dblclick('[oid]');

    // Clear text and type new
    await page.keyboard.press('Control+a');
    await page.keyboard.type('New Text');
    await page.keyboard.press('Escape');

    // Wait for update
    await page.waitForTimeout(500);

    // Verify text changed
    const button = page.locator('[oid]');
    await expect(button).toContainText('New Text');
  });

  test('should show color picker for background', async ({ page }) => {
    // Select element
    await page.click('[oid]');

    // Click color swatch
    await page.click('[data-testid="color-background-swatch"]');

    // Color picker should appear
    await expect(page.locator('[data-testid="color-picker"]')).toBeVisible();
  });
});
```

### 6.2 Undo/Redo E2E

```typescript
// e2e/undo-redo.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Undo/Redo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="canvas"]');
  });

  test('should undo style change', async ({ page }) => {
    // Select element and get original padding
    await page.click('[oid]');
    const button = page.locator('[oid]');
    const originalPadding = await button.evaluate(el => getComputedStyle(el).paddingTop);

    // Change padding
    const paddingInput = page.locator('[data-testid="spacing-padding-top"]');
    await paddingInput.clear();
    await paddingInput.fill('30px');
    await paddingInput.press('Enter');

    await page.waitForTimeout(500);

    // Verify change
    const newPadding = await button.evaluate(el => getComputedStyle(el).paddingTop);
    expect(newPadding).toBe('30px');

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    // Verify undo
    const revertedPadding = await button.evaluate(el => getComputedStyle(el).paddingTop);
    expect(revertedPadding).toBe(originalPadding);
  });

  test('should redo after undo', async ({ page }) => {
    // Select and change
    await page.click('[oid]');
    const paddingInput = page.locator('[data-testid="spacing-padding-top"]');
    await paddingInput.clear();
    await paddingInput.fill('25px');
    await paddingInput.press('Enter');

    await page.waitForTimeout(500);

    // Undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    // Redo
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(500);

    // Verify redo
    const button = page.locator('[oid]');
    const padding = await button.evaluate(el => getComputedStyle(el).paddingTop);
    expect(padding).toBe('25px');
  });

  test('should clear redo stack on new action', async ({ page }) => {
    // Select and change twice
    await page.click('[oid]');
    const paddingInput = page.locator('[data-testid="spacing-padding-top"]');

    // First change
    await paddingInput.clear();
    await paddingInput.fill('20px');
    await paddingInput.press('Enter');
    await page.waitForTimeout(300);

    // Second change
    await paddingInput.clear();
    await paddingInput.fill('30px');
    await paddingInput.press('Enter');
    await page.waitForTimeout(300);

    // Undo once
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    // Make new change (should clear redo)
    await paddingInput.clear();
    await paddingInput.fill('40px');
    await paddingInput.press('Enter');
    await page.waitForTimeout(300);

    // Try to redo (should do nothing)
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(300);

    // Padding should still be 40px
    const button = page.locator('[oid]');
    const padding = await button.evaluate(el => getComputedStyle(el).paddingTop);
    expect(padding).toBe('40px');
  });
});
```

### 6.3 Variant Creation E2E

```typescript
// e2e/variant-creation.spec.ts
import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import { join } from 'path';

test.describe('Variant Creation', () => {
  const PROJECT_DIR = join(__dirname, 'fixtures/test-project');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="canvas"]');
  });

  test('should create new variant', async ({ page }) => {
    // Select element
    await page.click('[oid]');

    // Open variants section
    await page.click('[data-testid="variants-section-header"]');

    // Click create variant button
    await page.click('[data-testid="create-variant-button"]');

    // Dialog should appear
    await expect(page.locator('[data-testid="variant-dialog"]')).toBeVisible();

    // Enter variant name
    await page.fill('[data-testid="variant-name-input"]', 'primary');

    // Confirm creation
    await page.click('[data-testid="variant-confirm-button"]');

    await page.waitForTimeout(1000);

    // Verify variant appears in list
    await expect(page.locator('[data-testid="variant-primary"]')).toBeVisible();

    // Verify CSS file was updated
    const cssContent = await readFile(
      join(PROJECT_DIR, 'src/components/Button/Button.module.css'),
      'utf-8'
    );
    expect(cssContent).toContain('.primary');
  });

  test('should apply variant to element', async ({ page }) => {
    // Select element
    await page.click('[oid]');

    // Open variants section
    await page.click('[data-testid="variants-section-header"]');

    // Toggle variant checkbox
    await page.click('[data-testid="variant-large-checkbox"]');

    await page.waitForTimeout(500);

    // Verify JSX was updated
    const jsxContent = await readFile(
      join(PROJECT_DIR, 'src/components/Button/Button.tsx'),
      'utf-8'
    );
    expect(jsxContent).toContain('styles.large');
  });

  test('should show validation error for invalid variant name', async ({ page }) => {
    // Select element
    await page.click('[oid]');

    // Open create variant dialog
    await page.click('[data-testid="variants-section-header"]');
    await page.click('[data-testid="create-variant-button"]');

    // Enter invalid name (starts with number)
    await page.fill('[data-testid="variant-name-input"]', '123invalid');

    // Error should appear
    await expect(page.locator('[data-testid="variant-name-error"]')).toBeVisible();

    // Confirm button should be disabled
    await expect(page.locator('[data-testid="variant-confirm-button"]')).toBeDisabled();
  });
});
```

### 6.4 External Changes E2E

```typescript
// e2e/external-changes.spec.ts
// Tests external file changes detected via Vite HMR (not WebSocket)
import { test, expect } from '@playwright/test';
import { writeFile, readFile } from 'fs/promises';
import { join } from 'path';

test.describe('External Changes (via Vite HMR)', () => {
  const PROJECT_DIR = join(__dirname, 'fixtures/test-project');
  const CSS_FILE = join(PROJECT_DIR, 'src/components/Button/Button.module.css');

  let originalContent: string;

  test.beforeEach(async ({ page }) => {
    // Save original content
    originalContent = await readFile(CSS_FILE, 'utf-8');

    await page.goto('/');
    await page.waitForSelector('[data-testid="canvas"]');
  });

  test.afterEach(async () => {
    // Restore original content
    await writeFile(CSS_FILE, originalContent);
  });

  test('should update UI when file is modified externally', async ({ page }) => {
    // Select element
    await page.click('[oid]');

    // Get current padding display
    const paddingInput = page.locator('[data-testid="spacing-padding-top"]');
    const originalValue = await paddingInput.inputValue();

    // Modify file externally
    const modifiedContent = originalContent.replace(/padding:\s*\d+px/, 'padding: 50px');
    await writeFile(CSS_FILE, modifiedContent);

    // Wait for file watcher and HMR
    await page.waitForTimeout(1000);

    // Properties panel should update
    const newValue = await paddingInput.inputValue();
    expect(newValue).toBe('50px');
  });

  test('should clear pending edits on external change', async ({ page }) => {
    // Select element and make a change
    await page.click('[oid]');
    const paddingInput = page.locator('[data-testid="spacing-padding-top"]');
    await paddingInput.clear();
    await paddingInput.fill('30px');
    // Don't press Enter - keep it pending

    // Modify file externally
    const modifiedContent = originalContent.replace(/padding:\s*\d+px/, 'padding: 60px');
    await writeFile(CSS_FILE, modifiedContent);

    // Wait for update
    await page.waitForTimeout(1000);

    // Pending indicator should be gone
    await expect(page.locator('[data-testid="pending-indicator"]')).not.toBeVisible();

    // Value should reflect external change
    const currentValue = await paddingInput.inputValue();
    expect(currentValue).toBe('60px');
  });

  test('should clear undo stack for modified file', async ({ page }) => {
    // Select and change
    await page.click('[oid]');
    const paddingInput = page.locator('[data-testid="spacing-padding-top"]');
    await paddingInput.clear();
    await paddingInput.fill('35px');
    await paddingInput.press('Enter');

    await page.waitForTimeout(500);

    // Verify undo is available
    const undoButton = page.locator('[data-testid="undo-button"]');
    await expect(undoButton).not.toBeDisabled();

    // External modification
    const modifiedContent = originalContent.replace(/padding:\s*\d+px/, 'padding: 70px');
    await writeFile(CSS_FILE, modifiedContent);

    await page.waitForTimeout(1000);

    // Undo should now be disabled
    await expect(undoButton).toBeDisabled();
  });
});
```

---

## 7. Test Fixtures & Mocks

### 7.1 CSS Fixtures

```css
/* test/fixtures/css/button.module.css */
.button {
  padding: 12px 24px;
  background-color: #1a73e8;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.button:hover {
  background-color: #1557b0;
}

/* Variant classes */
.large {
  padding: 16px 32px;
  font-size: 18px;
}

.small {
  padding: 8px 16px;
  font-size: 12px;
}
```

```css
/* test/fixtures/css/with-variables.module.css */
.card {
  padding: var(--spacing-md);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
```

```css
/* test/fixtures/css/malformed.css */
/* This file has intentional syntax errors for testing */
.broken {
  padding: 12px
  color: red;  /* Missing semicolon above */
}

.unclosed {
  margin: 10px;
/* Missing closing brace */
```

### 7.2 JSX Fixtures

```tsx
// test/fixtures/jsx/Button.tsx
import styles from './Button.module.css';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function Button({ children, onClick, disabled }: ButtonProps) {
  return (
    <button
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
```

```tsx
// test/fixtures/jsx/WithVariants.tsx
import styles from './Button.module.css';

export function ButtonWithVariants() {
  return (
    <button className={`${styles.button} ${styles.large}`}>
      Large Button
    </button>
  );
}
```

### 7.3 WebSocket Mock

```typescript
// test/mocks/websocket.ts
import { vi } from 'vitest';

export function createMockWebSocket() {
  const listeners: Record<string, Function[]> = {};
  const sentMessages: string[] = [];

  return {
    send: vi.fn((data: string) => {
      sentMessages.push(data);
    }),

    close: vi.fn(),

    addEventListener: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),

    removeEventListener: vi.fn((event: string, handler: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
    }),

    // Test helpers
    simulateMessage: (data: object) => {
      const event = { data: JSON.stringify(data) };
      listeners['message']?.forEach(handler => handler(event));
    },

    simulateOpen: () => {
      listeners['open']?.forEach(handler => handler());
    },

    simulateClose: () => {
      listeners['close']?.forEach(handler => handler());
    },

    simulateError: (error: Error) => {
      listeners['error']?.forEach(handler => handler(error));
    },

    getSentMessages: () => sentMessages,
    getLastSentMessage: () => sentMessages[sentMessages.length - 1],
    clearSentMessages: () => sentMessages.length = 0,

    readyState: 1, // OPEN
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  };
}
```

### 7.4 Test Helpers

```typescript
// test/helpers.ts
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = join(__dirname, 'fixtures');

export function readFixture(path: string): string {
  return readFileSync(join(FIXTURES_DIR, path), 'utf-8');
}

export function createElementTarget(overrides: Partial<ElementTarget> = {}): ElementTarget {
  return {
    file: 'src/components/Button.tsx',
    lineNumber: 10,
    column: 5,
    cssFile: 'src/components/Button.module.css',
    selector: '.button',
    ...overrides,
  };
}

export function createMockDOMElement(tag = 'button'): HTMLElement {
  const element = document.createElement(tag);
  element.className = 'Button_button__abc123';

  // Set oid attribute
  const oid = 'Button-10-5';
  element.setAttribute('oid', oid);

  // Populate mock OID registry
  window.__ALARA_OID_REGISTRY__ = window.__ALARA_OID_REGISTRY__ || new Map();
  window.__ALARA_OID_REGISTRY__.set(oid, {
    oid,
    file: 'src/components/Button.tsx',
    lineNumber: 10,
    column: 5,
    cssFile: 'src/components/Button.module.css',
    selector: '.button',
  });

  return element;
}

/**
 * Create a TransformContext for testing.
 * Includes cssCache, project, and transaction.
 */
export function createTestContext(): TransformContext {
  return {
    projectDir: '/test/project',
    cssCache: new CSSCache(),
    project: new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
      },
    }),
    transaction: new Transaction(),
  };
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Timeout waiting for condition');
}
```

---

## 8. Critical Test Cases

### 8.1 CSS Transformation Test Matrix

| Test Case | Input | Expected Output | Priority |
|-----------|-------|-----------------|----------|
| Update existing property | `.a { color: red; }` + update color to blue | `.a { color: blue; }` | Critical |
| Add new property | `.a { color: red; }` + add padding | `.a { color: red; padding: 10px; }` | Critical |
| Remove property | `.a { color: red; padding: 10px; }` + remove padding | `.a { color: red; }` | High |
| Preserve comments | `/* comment */ .a { color: red; }` | Comments preserved | Critical |
| Preserve formatting | `.a {\n  color: red;\n}` | Indentation preserved | Critical |
| Handle CSS variables | `.a { color: var(--x); }` | Variables preserved | High |
| Multiple selectors | `.a, .b { color: red; }` | Correct selector targeted | High |
| Nested rules (future) | `.a { .b { color: red; } }` | Correct nesting | Medium |
| Media queries | `@media { .a { color: red; } }` | Rules inside media work | Medium |
| Invalid CSS | `malformed input` | Graceful error | Critical |

### 8.2 JSX Transformation Test Matrix

| Test Case | Input | Expected Output | Priority |
|-----------|-------|-----------------|----------|
| Simple className | `className={styles.x}` | `className={\`\${styles.x} \${styles.y}\`}` | Critical |
| Template literal | `className={\`\${styles.x}\`}` | Add class to existing template | Critical |
| Preserve props | `onClick={fn}` | All props preserved | Critical |
| Preserve children | `<button>text</button>` | Children preserved | Critical |
| Self-closing element | `<input />` | Handle self-closing | High |
| Nested elements | `<div><button /></div>` | Correct element targeted | High |
| Conditional className | `className={condition ? styles.a : styles.b}` | Error: unsupported | High |
| Text update | `>Old text<` | `>New text<` | Critical |
| Missing className | `<button>` | Error: no className | High |
| Wrong file type | `.js` file | Handle gracefully | Medium |

### 8.3 Undo/Redo Test Matrix

| Test Case | Actions | Expected State | Priority |
|-----------|---------|----------------|----------|
| Single undo | Change → Undo | Original state | Critical |
| Single redo | Change → Undo → Redo | Changed state | Critical |
| Multiple undo | A → B → C → Undo → Undo | State after A | Critical |
| New action clears redo | A → Undo → B | Redo stack empty | Critical |
| External change clears | A → External | Both stacks cleared for file | Critical |
| Max stack size | 150 changes | Only 100 in stack | Medium |
| Cross-file undo | Change file A, change file B, undo | Only B reverted | High |

---

## 9. CI/CD Integration

### 9.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run unit tests
        run: bun test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Run integration tests
        run: bun test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Install Playwright
        run: bunx playwright install --with-deps

      - name: Run E2E tests
        run: bun test:e2e

      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/

  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Type check
        run: bun run typecheck
```

### 9.2 Pre-commit Hooks

```json
// package.json
{
  "scripts": {
    "prepare": "husky install"
  },
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "vitest related --run"
    ],
    "*.{css,json,md}": [
      "prettier --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

bunx lint-staged
```

### 9.3 Test Coverage Requirements

| Package | Statement | Branch | Function | Line |
|---------|-----------|--------|----------|------|
| @alara/service | 80% | 75% | 80% | 80% |
| @alara/builder | 75% | 70% | 75% | 75% |
| @alara/core (shared) | 90% | 85% | 90% | 90% |
| @alara/runtime | 70% | 65% | 70% | 70% |

---

## Summary

| Test Type | Count (Approx) | Run Time | When to Run |
|-----------|----------------|----------|-------------|
| Unit Tests | 150+ | <10s | Every save (watch mode) |
| Integration Tests | 30+ | <30s | Pre-commit, CI |
| E2E Tests | 20+ | <2min | Pre-push, CI |
| **Total** | **200+** | **<3min** | Full suite in CI |
