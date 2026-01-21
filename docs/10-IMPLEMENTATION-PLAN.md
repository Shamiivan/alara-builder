# 10 - Implementation Plan

Vertical slice approach: each phase delivers a working feature end-to-end (UI → Server → File).

---

## Current Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0: Walking Skeleton | Complete | CLI, Vite plugin shell, Bun server, client runtime, integration test |
| Phase 1: Type Foundation | Complete | Zod schemas, CSS parser, color parser, value serializer |
| Phase 2+ | In progress| Vertical slices below |

---

## Phase 2: Text Editing (First Vertical Slice)


| Slice | Description |
|-------|-------------|
| **2.1 Babel Plugin (oid only)** | Inject `oid="{file}:{line}:{col}"` attribute on JSX elements. Use @rollup/plugin-babel in Vite. |
| **2.2 JSX Transformer** | ts-morph utilities: `findElementAt(file, line, col)`, `updateTextContent(element, text)` |
| **2.3 Selection System** | Click detection on elements with `oid`, parse attribute, store in Zustand |
| **2.4 Selection Overlay** | Blue outline positioned via `getBoundingClientRect()` on selected element |
| **2.5 Text Edit Behavior** | Double-click → `contentEditable=true`, commit on Enter/blur |
| **2.6 Server: text-update** | WebSocket handler: receive `{type: 'text-update', oid, text}`, call JSX transformer |
| **2.7 E2E Test** | Double-click text → edit → blur → file changes → Vite HMR updates DOM |

**Infrastructure built:**
- Babel plugin foundation (extend for `css` attribute later)
- Vite plugin + Babel integration
- WebSocket message routing
- Selection state (Zustand)
- Editor behavior pattern
- ts-morph utilities
- Transform handler pattern

---

## Phase 3: CSS Editing - Spacing

Build on Phase 2 infrastructure, add CSS Module support.

| Slice | Description |
|-------|-------------|
| **3.1 Babel Plugin (css attribute)** | Extend plugin: trace `className={styles.X}` → import → add `css="{cssFile}:{selectors}"` |
| **3.2 Toolbox Shell** | Floating UI container, positioned near selected element |
| **3.3 Spacing Panel** | Padding/margin inputs using existing `@alara/core` PostCSS utilities |
| **3.4 Server: css-update** | WebSocket handler: receive `{type: 'css-update', css, property, value}`, update CSS file |
| **3.5 E2E Test** | Select element → change padding in toolbox → file changes → HMR updates |

**Infrastructure built:**
- CSS Module resolution in Babel plugin
- Toolbox foundation
- Panel plugin pattern
- css-update transform handler

---

## Phase 4: CSS Editing - Colors

| Slice | Description |
|-------|-------------|
| **4.1 Color Picker Component** | HSL/hex input, uses existing `@alara/core` color parser |
| **4.2 Colors Panel** | Background, text color, border color inputs |
| **4.3 CSS Variable Hint** | Show "from var(--color-primary)" when value uses variable |
| **4.4 E2E Test** | Select element → change color → file changes → HMR updates |

---

## Phase 5: CSS Editing - Typography

| Slice | Description |
|-------|-------------|
| **5.1 Typography Panel** | Font-size, font-weight, line-height, font-family |
| **5.2 Unit Selector** | Toggle between px/rem/em for size values |
| **5.3 E2E Test** | Select text → change font-size → file changes → HMR updates |

---

## Phase 6: CSS Editing - Borders & Effects

| Slice | Description |
|-------|-------------|
| **6.1 Border Panel** | Border width/style/color, border-radius (corners) |
| **6.2 Effects Panel** | Box-shadow, opacity |
| **6.3 css-add Handler** | Add new CSS property that doesn't exist in rule |
| **6.4 css-remove Handler** | Remove CSS property from rule |

---

## Phase 7: Variants

Multi-file edits: CSS + JSX in single transaction.

| Slice | Description |
|-------|-------------|
| **7.1 Transaction System** | Atomic multi-file writes with backup/rollback |
| **7.2 add-variant Handler** | Create new CSS class + update JSX className |
| **7.3 apply-variant Handler** | Add existing variant class to element |
| **7.4 remove-variant Handler** | Remove variant class from element |
| **7.5 Variant Picker UI** | Show available classes from CSS file, allow selection |

---

## Phase 8: Undo/Redo

| Slice | Description |
|-------|-------------|
| **8.1 Command Pattern** | `Command` interface with `execute()` and `undo()` |
| **8.2 Undo Stack** | Push on edit, pop on Ctrl+Z, apply reverse transform |
| **8.3 Redo Stack** | Push on undo, clear on new edit, Ctrl+Shift+Z |
| **8.4 HMR Integration** | Clear undo/redo for file when external change detected |
| **8.5 Error Recovery** | Transaction rollback UI, retry prompts |

---

## Phase 9: Polish & Production

| Slice | Description |
|-------|-------------|
| **9.1 init Command** | `alara init` - detect project type, install runtime, update vite.config |
| **9.2 dev Command Polish** | Validate project structure, graceful shutdown, helpful errors |
| **9.3 Production Build** | Strip `oid` and `css` attributes in production |
| **9.4 FileWatcher** | Bun.watch() with debounce, notify client of external changes |
| **9.5 CSS Cache (if needed)** | LRU cache for PostCSS ASTs - add only if profiling shows need |

---

## Testing Strategy

Each phase includes E2E tests validating the full vertical slice. See [09-TESTING.md](./09-TESTING.md) for detailed test specifications.

### Test Stack

| Tool | Purpose |
|------|---------|
| **Bun Test** | Unit & integration tests (`bun:test`) |
| **Playwright** | E2E browser tests (`@playwright/test`) |

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Test Coverage by Phase

| Phase | Unit Tests | E2E Tests | Key Test Cases |
|-------|------------|-----------|----------------|
| 2 (Text) | 20+ | 3 | `oid` injection, selection overlay, text edit → file update |
| 3 (Spacing) | 15+ | 2 | `css` injection, toolbox appears, padding change → CSS update |
| 4 (Colors) | 10+ | 2 | Color picker, hex/hsl input, color change → CSS update |
| 5 (Typography) | 10+ | 1 | Font inputs, unit selector, typography change → CSS update |
| 6 (Borders) | 15+ | 2 | Border panel, css-add handler, border change → CSS update |
| 7 (Variants) | 20+ | 3 | Transaction rollback, variant create → CSS+JSX update |
| 8 (Undo/Redo) | 15+ | 3 | Ctrl+Z reverts, Ctrl+Shift+Z redoes, external change clears stack |
| 9 (Polish) | 10+ | 2 | `alara init` works, production build strips attributes |

### E2E Test Examples

#### Phase 2: Text Editing

```typescript
// e2e/phase2-text-editing.spec.ts
import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';

test('edit text updates source file', async ({ page }) => {
  await page.goto('/');

  // Double-click to edit text
  const element = page.locator('[oid]:has-text("Click me")').first();
  await element.dblclick();

  // Type new text
  await page.keyboard.press('Control+a');
  await page.keyboard.type('New Text');
  await page.keyboard.press('Enter');

  // Wait for HMR
  await page.waitForTimeout(1000);

  // Verify DOM updated
  await expect(element).toHaveText('New Text');

  // Verify file updated
  const oid = await element.getAttribute('oid');
  const [file] = oid!.split(':');
  const content = await readFile(file, 'utf-8');
  expect(content).toContain('New Text');
});
```

#### Phase 3: CSS Spacing

```typescript
// e2e/phase3-css-spacing.spec.ts
test('change padding updates CSS file', async ({ page }) => {
  await page.goto('/');

  // Select element
  const element = page.locator('[oid][css]').first();
  await element.click();

  // Change padding in toolbox
  const input = page.getByTestId('spacing-padding-top');
  await input.clear();
  await input.fill('24px');
  await input.press('Enter');

  // Wait for HMR
  await page.waitForTimeout(1000);

  // Verify computed style
  const padding = await element.evaluate(
    el => getComputedStyle(el).paddingTop
  );
  expect(padding).toBe('24px');
});
```

---

## Vertical Slice Checklist

After each phase, verify:

1. ✅ Feature works end-to-end (UI → Server → File → HMR)
2. ✅ E2E test passes
3. ✅ No regressions in previous phases
4. ✅ Can demo the feature to stakeholders

---

## Key Technical Decisions

### Babel Plugin via @rollup/plugin-babel

```typescript
// vite.config.ts
import { babel } from '@rollup/plugin-babel'

export default defineConfig({
  plugins: [
    babel({
      plugins: ['@alara/babel-plugin'],
      extensions: ['.tsx', '.jsx'],
    }),
  ],
})
```

### ts-morph for JSX Manipulation

```typescript
// Find element and update text
const sourceFile = project.getSourceFile(filePath);
const element = findElementAt(sourceFile, line, col);
element.getFirstChildByKind(SyntaxKind.JsxText)?.replaceWithText(newText);
await sourceFile.save();
```

### WebSocket Message Flow

```
Client                          Server
  │                                │
  │  {type:'text-update',          │
  │   oid:'src/App.tsx:12:4',      │
  │   text:'New Text'}             │
  │  ─────────────────────────────►│
  │                                │ ts-morph: find element, update text
  │                                │ write file
  │                                │
  │  {status:'ok', requestId}      │
  │  ◄─────────────────────────────│
  │                                │
  │  [Vite HMR updates DOM]        │
  │                                │
```

### Selection State (Zustand)

```typescript
interface SelectionSlice {
  selectedOid: string | null;
  selectedCss: string | null;
  select: (oid: string, css: string | null) => void;
  deselect: () => void;
}
```

---

## Dependencies by Phase

| Phase | New Dependencies |
|-------|------------------|
| 2 | @rollup/plugin-babel, @babel/core, ts-morph |
| 3 | @floating-ui/react |
| 4 | (uses existing colorjs.io) |
| 7 | (no new deps - uses existing PostCSS) |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Babel plugin complexity | Start with `oid` only, add `css` in Phase 3 |
| ts-morph learning curve | Well-documented, 790 code snippets in Context7 |
| Multi-file atomicity | Defer transaction system to Phase 7 (variants) |
| Performance | Event-driven access, no caching needed initially |
