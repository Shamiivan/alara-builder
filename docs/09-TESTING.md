# 09 - Testing Strategy

This document defines the testing approach, test categories, and rationale for Alara Builder's test suite.

> **Important**: Test implementations live in **their own files**, not in documentation.
> - For test file locations, see [01-ARCHITECTURE.md](./01-ARCHITECTURE.md#test-file-locations)
> - For TypeScript interfaces used in testing, see [03-INTERFACES.md](./03-INTERFACES.md#8-testing-interfaces)

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
                  │    Tests    │  (Bun test + real modules)
                 ─┴─────────────┴─
                ┌─────────────────┐
                │    Unit Tests   │  Many, fast, isolated
                │                 │  (Bun test)
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
| **Bun Test** | Unit & integration tests | Built-in (`bun:test`) |
| **Playwright** | E2E browser tests | `@playwright/test` |
| **Testing Library** | React component tests | `@testing-library/react` |
| **Zod** | Schema validation in tests | `zod` |

### 2.2 Test Scripts

**Root package.json**:
- `test` - Run all unit tests via turbo
- `test:e2e` - Run Playwright E2E tests
- `test:e2e:ui` - Run Playwright with UI mode
- `test:e2e:headed` - Run Playwright in headed browser
- `test:e2e:debug` - Run Playwright with debugger

**Package-level scripts** (core, service, builder):
- `test` - Run unit tests with bun test
- `test:watch` - Run tests in watch mode

### 2.3 Playwright Best Practices

Following [Playwright documentation](https://playwright.dev/docs/best-practices):

- **Use Web-First Assertions** - Auto-wait for conditions instead of manual checks
- **Use Locators Over Selectors** - Prefer `getByRole`, `getByTestId`, `getByLabel` over CSS selectors
- **Use Test Fixtures for Setup** - Share common setup logic across tests

---

## 3. Test Structure

### 3.1 Directory Layout

Test files are colocated with source code or grouped in `test/` directories. See [01-ARCHITECTURE.md](./01-ARCHITECTURE.md#test-file-locations) for the complete directory structure.

**Key locations**:
- `packages/*/src/**/*.test.ts` - Unit tests colocated with source
- `packages/*/src/__tests__/` - Grouped unit tests
- `packages/service/test/integration/` - Integration tests
- `e2e/` - Playwright E2E tests

### 3.2 Test Naming Conventions

- **Unit test file**: `[module].test.ts`
- **Integration test**: `[feature]-flow.test.ts`
- **E2E test**: `[feature].spec.ts`

**Test naming pattern**:
```
describe('ModuleName')
  describe('methodName')
    it('should [expected behavior] when [condition]')
    it('should throw [error] when [invalid condition]')
```

---

## 4. Unit Tests

Unit tests verify individual functions and classes in isolation.

### 4.1 CSS Update Handler Tests

**Purpose**: Verify CSS property updates work correctly.

**Test cases**:
- Update an existing CSS property value
- Preserve CSS comments during updates
- Throw `SELECTOR_NOT_FOUND` when selector doesn't exist
- Handle shorthand properties (padding, margin)
- Preserve original formatting and indentation

#### Example: Update an existing CSS property value

**Before (button.module.css):**
```css
.button {
  background-color: #3b82f6;
  padding: 12px 24px;
  border-radius: 8px;
}
```

**After (user changes background color in visual editor):**
```css
.button {
  background-color: #ef4444;
  padding: 12px 24px;
  border-radius: 8px;
}
```

**Use case:** User clicks color picker and selects red instead of blue.

#### Example: Preserve CSS comments during updates

**Before:**
```css
.card {
  /* Brand shadow - do not change */
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  /* Responsive padding */
  padding: 16px;
  margin: 8px;
}
```

**After (user changes padding):**
```css
.card {
  /* Brand shadow - do not change */
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  /* Responsive padding */
  padding: 24px;
  margin: 8px;
}
```

**Key:** Comments are preserved exactly where they were.

#### Example: Throw SELECTOR_NOT_FOUND when selector doesn't exist

**Input CSS:**
```css
.header {
  font-size: 24px;
}
```

**Request:** Update `.footer { color: red }`

**Expected:** Throw `TransformError` with code `SELECTOR_NOT_FOUND`

```typescript
expect(() => updateCss(css, '.footer', 'color', 'red'))
  .toThrow(TransformError);
expect(error.code).toBe('SELECTOR_NOT_FOUND');
```

#### Example: Handle shorthand properties (padding, margin)

**Before:**
```css
.container {
  padding: 16px;
}
```

**After (user changes only padding-left in spacing panel):**
```css
.container {
  padding: 16px 16px 16px 32px;
}
```

**Or with existing longhand:**
```css
/* Before */
.container {
  padding-top: 16px;
  padding-right: 16px;
  padding-bottom: 16px;
  padding-left: 16px;
}

/* After (change padding-left only) */
.container {
  padding-top: 16px;
  padding-right: 16px;
  padding-bottom: 16px;
  padding-left: 32px;
}
```

#### Example: Preserve original formatting and indentation

**Before (uses tabs, specific spacing):**
```css
.title {
		color: #333;
		font-weight: bold;
		/* Custom font */
		font-family: 'Inter', sans-serif;
}
```

**After (must preserve tabs and empty lines):**
```css
.title {
		color: #ff0000;
		font-weight: bold;
		/* Custom font */
		font-family: 'Inter', sans-serif;
}
```

**Key:** Indentation style (tabs vs spaces) and spacing are preserved exactly.

### 4.2 Add Variant Handler Tests

**Purpose**: Verify variant creation in CSS Modules.

**Test cases**:
- Create a new variant class with styles
- Throw `VARIANT_ALREADY_EXISTS` if class name conflicts
- Generate valid CSS class names
- Position new variant after base class

#### Example: Create a new variant class with styles

**Before (button.module.css):**
```css
.button {
  padding: 12px 24px;
  background-color: #3b82f6;
  border-radius: 8px;
}

.large {
  padding: 16px 32px;
  font-size: 18px;
}
```

**After (user creates "small" variant in visual editor):**
```css
.button {
  padding: 12px 24px;
  background-color: #3b82f6;
  border-radius: 8px;
}

.large {
  padding: 16px 32px;
  font-size: 18px;
}

.small {
  padding: 8px 16px;
  font-size: 14px;
}
```

**Use case:** User right-clicks element and selects "Create Variant" → enters "small".

#### Example: Throw VARIANT_ALREADY_EXISTS if class name conflicts

**Existing CSS:**
```css
.button {
  padding: 12px 24px;
}

.primary {
  background-color: #3b82f6;
}
```

**Request:** Create variant named "primary"

**Expected:**
```typescript
expect(() => addVariant(css, 'button', 'primary', styles))
  .toThrow(TransformError);
expect(error.code).toBe('VARIANT_ALREADY_EXISTS');
expect(error.message).toContain('.primary');
```

#### Example: Generate valid CSS class names

| User Input | Generated Class Name | Valid? |
|------------|---------------------|--------|
| `"Large Button"` | `.largeButton` | ✓ camelCase |
| `"123start"` | `.\_123start` | ✓ escaped leading digit |
| `"my-variant"` | `.my-variant` | ✓ valid as-is |
| `"@special!"` | Error | ✗ invalid characters |

**Test:**
```typescript
expect(generateClassName('Large Button')).toBe('largeButton');
expect(generateClassName('123start')).toBe('_123start');
expect(() => generateClassName('@special!')).toThrow();
```

#### Example: Position new variant after base class

**Before:**
```css
/* Header styles */
.header {
  height: 64px;
}

/* Navigation */
.nav {
  display: flex;
}

.navItem {
  padding: 8px;
}
```

**After (create variant "sticky" for .header):**
```css
/* Header styles */
.header {
  height: 64px;
}

.sticky {
  position: fixed;
  top: 0;
  z-index: 100;
}

/* Navigation */
.nav {
  display: flex;
}

.navItem {
  padding: 8px;
}
```

**Key:** New variant `.sticky` is inserted directly after its base class `.header`, preserving document structure.

### 4.3 Transform Registry Tests

**Purpose**: Verify handler registration and dispatch.

**Test cases**:
- Register and execute handlers
- Throw for unknown handler types
- Validate requests with Zod schemas
- List registered handler types

#### Example: Register and execute handlers

**Registration:**
```typescript
const registry = new TransformRegistry();

registry.register('css-update', {
  schema: CssUpdateRequestSchema,
  handler: async (request, context) => {
    // Update CSS property
    return { success: true, modified: [request.file] };
  }
});

registry.register('jsx-text', {
  schema: JsxTextRequestSchema,
  handler: async (request, context) => {
    // Update JSX text content
    return { success: true, modified: [request.file] };
  }
});
```

**Execution:**
```typescript
const result = await registry.execute('css-update', {
  file: 'button.module.css',
  selector: '.button',
  property: 'color',
  value: '#ff0000'
}, context);

expect(result.success).toBe(true);
expect(result.modified).toContain('button.module.css');
```

#### Example: Throw for unknown handler types

```typescript
const registry = new TransformRegistry();
registry.register('css-update', cssHandler);

// Attempt to execute unregistered handler
await expect(
  registry.execute('unknown-type', {}, context)
).rejects.toThrow(TransformError);

expect(error.code).toBe('UNKNOWN_HANDLER');
expect(error.message).toContain('unknown-type');
```

#### Example: Validate requests with Zod schemas

**Schema definition:**
```typescript
const CssUpdateRequestSchema = z.object({
  file: z.string().endsWith('.module.css'),
  selector: z.string().startsWith('.'),
  property: z.string().min(1),
  value: z.string()
});
```

**Valid request:**
```typescript
const validRequest = {
  file: 'button.module.css',
  selector: '.button',
  property: 'padding',
  value: '16px'
};
// Passes validation, handler executes
```

**Invalid requests:**
```typescript
// Missing .module.css extension
const invalid1 = { file: 'button.css', selector: '.btn', property: 'color', value: 'red' };
// → ZodError: file must end with '.module.css'

// Selector missing dot prefix
const invalid2 = { file: 'btn.module.css', selector: 'button', property: 'color', value: 'red' };
// → ZodError: selector must start with '.'

// Empty property
const invalid3 = { file: 'btn.module.css', selector: '.btn', property: '', value: 'red' };
// → ZodError: property must be at least 1 character
```

#### Example: List registered handler types

```typescript
const registry = new TransformRegistry();
registry.register('css-update', cssHandler);
registry.register('css-add-variant', variantHandler);
registry.register('jsx-text', textHandler);
registry.register('jsx-class', classHandler);

const types = registry.getRegisteredTypes();
expect(types).toEqual([
  'css-update',
  'css-add-variant',
  'jsx-text',
  'jsx-class'
]);
```

### 4.4 CSS Utilities Tests

**Purpose**: Verify CSS parsing and manipulation helpers.

**Test cases**:
- Find rules by exact selector
- Handle CSS Modules hashed selectors
- Parse shorthand values into components
- Convert between value formats

#### Example: Find rules by exact selector

**Input CSS:**
```css
.button {
  padding: 12px;
}

.button:hover {
  opacity: 0.9;
}

.button.active {
  background: blue;
}

.buttonGroup {
  display: flex;
}
```

**Test cases:**
```typescript
// Exact match
const rule1 = findRule(ast, '.button');
expect(rule1.selector).toBe('.button');
expect(rule1.declarations).toHaveLength(1);

// Pseudo-selector (different rule)
const rule2 = findRule(ast, '.button:hover');
expect(rule2.selector).toBe('.button:hover');

// Compound selector
const rule3 = findRule(ast, '.button.active');
expect(rule3.selector).toBe('.button.active');

// Should NOT match partial names
const rule4 = findRule(ast, '.button');
expect(rule4.selector).not.toBe('.buttonGroup'); // Different class entirely
```

#### Example: Handle CSS Modules hashed selectors

**Source CSS (button.module.css):**
```css
.button {
  padding: 12px;
}
```

**Compiled CSS (what's in the browser):**
```css
._button_x7k2j_1 {
  padding: 12px;
}
```

**Matching logic:**
```typescript
// Runtime provides: className = "_button_x7k2j_1"
// We need to find original: ".button"

const originalSelector = resolveModuleSelector(
  '_button_x7k2j_1',  // hashed class from DOM
  'button.module.css'  // source file
);
expect(originalSelector).toBe('.button');

// Now we can update the source file
const result = updateCss(sourceFile, '.button', 'padding', '16px');
```

**Pattern matching:**
```typescript
// CSS Modules hash pattern: _{className}_{hash}_{line}
const pattern = /^_([a-zA-Z][a-zA-Z0-9]*)_[a-z0-9]+_\d+$/;

expect(pattern.test('_button_x7k2j_1')).toBe(true);
expect('_button_x7k2j_1'.match(pattern)[1]).toBe('button');
```

#### Example: Parse shorthand values into components

**Padding shorthand:**
```typescript
// Single value: all sides
parseShorthand('padding', '16px');
// → { top: '16px', right: '16px', bottom: '16px', left: '16px' }

// Two values: vertical | horizontal
parseShorthand('padding', '8px 16px');
// → { top: '8px', right: '16px', bottom: '8px', left: '16px' }

// Three values: top | horizontal | bottom
parseShorthand('padding', '8px 16px 24px');
// → { top: '8px', right: '16px', bottom: '24px', left: '16px' }

// Four values: top | right | bottom | left
parseShorthand('padding', '8px 12px 16px 20px');
// → { top: '8px', right: '12px', bottom: '16px', left: '20px' }
```

**Margin shorthand (same pattern):**
```typescript
parseShorthand('margin', 'auto');
// → { top: 'auto', right: 'auto', bottom: 'auto', left: 'auto' }

parseShorthand('margin', '0 auto');
// → { top: '0', right: 'auto', bottom: '0', left: 'auto' }
```

**Border-radius shorthand:**
```typescript
parseShorthand('border-radius', '8px');
// → { topLeft: '8px', topRight: '8px', bottomRight: '8px', bottomLeft: '8px' }

parseShorthand('border-radius', '8px 16px');
// → { topLeft: '8px', topRight: '16px', bottomRight: '8px', bottomLeft: '16px' }
```

#### Example: Convert between value formats

**Unit conversions:**
```typescript
// px to rem (base 16px)
convertUnit('16px', 'rem');  // → '1rem'
convertUnit('24px', 'rem');  // → '1.5rem'

// rem to px
convertUnit('2rem', 'px');   // → '32px'

// Percentage (context-dependent)
convertUnit('50%', 'px', { containerWidth: 400 }); // → '200px'
```

**Color format conversions:**
```typescript
// Hex to RGB
convertColor('#3b82f6', 'rgb');
// → 'rgb(59, 130, 246)'

// Hex to HSL
convertColor('#3b82f6', 'hsl');
// → 'hsl(217, 91%, 60%)'

// RGB to Hex
convertColor('rgb(59, 130, 246)', 'hex');
// → '#3b82f6'

// Named color to Hex
convertColor('red', 'hex');
// → '#ff0000'

// With alpha
convertColor('#3b82f680', 'rgba');
// → 'rgba(59, 130, 246, 0.5)'
```

### 4.5 JSX Utilities Tests

**Purpose**: Verify JSX/TSX manipulation helpers.

**Test cases**:
- Convert simple className to template literal
- Add to existing template literal
- Preserve other props during modification
- Find elements at specific line numbers
- Handle self-closing elements

#### Example: Convert simple className to template literal

**Before:**
```tsx
<button className="btn-primary">Click me</button>
```

**After (when adding conditional class):**
```tsx
<button className={`btn-primary ${isActive ? 'active' : ''}`}>Click me</button>
```

**Use case:** User toggles a style in the visual editor that requires a conditional class.

#### Example: Add to existing template literal

**Before:**
```tsx
<div className={`card ${size}`}>Content</div>
```

**After (when adding another class via visual editor):**
```tsx
<div className={`card ${size} elevated`}>Content</div>
```

**Use case:** User adds a shadow effect in the visual editor to an element that already has dynamic classes.

#### Example: Preserve other props during modification

**Before:**
```tsx
<img
  src="/logo.png"
  alt="Company Logo"
  className="logo"
  onClick={handleClick}
  data-testid="main-logo"
/>
```

**After (when changing only className):**
```tsx
<img
  src="/logo.png"
  alt="Company Logo"
  className="logo large"
  onClick={handleClick}
  data-testid="main-logo"
/>
```

**Use case:** User resizes the image in the visual editor - only className changes, everything else stays intact.

#### Example: Find elements at specific line numbers

**Code context:**
```tsx
// line 15
function Hero() {
  return (
    <section className={styles.hero}>
      <h1 className={styles.title}>Welcome</h1>  {/* line 18 */}
      <p className={styles.subtitle}>Get started</p>
      <button className={styles.cta}>Sign Up</button>
    </section>
  );
}
```

**Scenario:** Visual editor reports `{ line: 18, column: 7 }` for the h1 element. The AST transformer must:
- Navigate to line 18
- Identify it's the h1 JSXElement
- Apply the transformation (e.g., change className)

#### Example: Handle self-closing elements

**Scenario A - Image element:**
```tsx
// Before
<img src="/hero.jpg" className="hero-image" />

// After (adding border style)
<img src="/hero.jpg" className="hero-image bordered" />
```

**Scenario B - Input element:**
```tsx
// Before
<input
  type="text"
  placeholder="Email"
  className={styles.input}
/>

// After (must remain self-closing)
<input
  type="text"
  placeholder="Email"
  className={`${styles.input} ${styles.large}`}
/>
```

**Use case:** User edits styling on self-closing elements like `<img>`, `<input>`, `<br>`, `<hr>` - the transformer must preserve the self-closing syntax.

#### Example: Real-world combined scenario

**Initial code:**
```tsx
export function ProductCard({ product }: Props) {
  const [hover, setHover] = useState(false);

  return (
    <article className={styles.card}>  {/* line 23 */}
      <img
        src={product.image}
        alt={product.name}
        className={styles.thumbnail}  {/* line 27 */}
      />
      <h3 className="product-title">{product.name}</h3>  {/* line 30 */}
      <p>{product.description}</p>
    </article>
  );
}
```

**User actions in visual editor:**
1. Clicks on the `<article>` (line 23) and adds shadow
2. Clicks on the `<img>` (line 27) and increases border radius
3. Clicks on the `<h3>` (line 30) and makes it bold

**After transformations:**
```tsx
export function ProductCard({ product }: Props) {
  const [hover, setHover] = useState(false);

  return (
    <article className={`${styles.card} ${styles.elevated}`}>
      <img
        src={product.image}
        alt={product.name}
        className={`${styles.thumbnail} ${styles.roundedLarge}`}
      />
      <h3 className={`product-title ${styles.bold}`}>{product.name}</h3>
      <p>{product.description}</p>
    </article>
  );
}
```

**Key things preserved:**
- The `useState` hook and `hover` variable (untouched code)
- All attributes on `<img>` except className
- The JSX expression `{product.name}` inside the h3
- Self-closing syntax on `<img>`
- Comments (if any existed)

These patterns are the foundation of "surgical edits" - making precise, localized changes without regenerating entire files.

### 4.6 Text Update Handler Tests

**Purpose**: Verify JSX text content updates.

**Test cases**:
- Replace text content in JSX
- Handle text with leading/trailing whitespace
- Throw `TEXT_NOT_FOUND` when text doesn't exist
- Handle special characters in text

#### Example: Replace text content in JSX

**Before:**
```tsx
<h1 className={styles.title}>Welcome to Our App</h1>
```

**After (user double-clicks and edits text):**
```tsx
<h1 className={styles.title}>Welcome to Alara Builder</h1>
```

**Test:**
```typescript
const result = updateText(jsx, {
  line: 5,
  column: 4,
  oldText: 'Welcome to Our App',
  newText: 'Welcome to Alara Builder'
});

expect(result).toContain('Welcome to Alara Builder');
expect(result).toContain('className={styles.title}'); // Props preserved
```

#### Example: Handle text with leading/trailing whitespace

**Before (formatted with newlines):**
```tsx
<p className={styles.intro}>
  This is a long paragraph that spans
  multiple lines in the source code.
</p>
```

**After (user edits the text):**
```tsx
<p className={styles.intro}>
  This is updated paragraph text that
  spans multiple lines in the source.
</p>
```

**Key:** Whitespace structure and formatting are preserved.

**Edge case - inline whitespace:**
```tsx
// Before
<span>  Hello   World  </span>

// After (user changes "World" to "There")
<span>  Hello   There  </span>
// Internal spacing preserved
```

#### Example: Throw TEXT_NOT_FOUND when text doesn't exist

**Input JSX:**
```tsx
<div>
  <h1>Welcome</h1>
  <p>Get started today</p>
</div>
```

**Request:** Update text "Goodbye" to "Hello"

**Expected:**
```typescript
expect(() => updateText(jsx, {
  line: 3,
  column: 6,
  oldText: 'Goodbye',  // Doesn't exist
  newText: 'Hello'
})).toThrow(TransformError);

expect(error.code).toBe('TEXT_NOT_FOUND');
expect(error.message).toContain('Goodbye');
```

#### Example: Handle special characters in text

**HTML entities:**
```tsx
// Before
<p>Price: $99 &amp; up</p>

// After (user adds more text)
<p>Price: $99 &amp; up — limited time!</p>
```

**Quotes and apostrophes:**
```tsx
// Before
<p>It's a "great" product</p>

// After
<p>It's an "amazing" product</p>
```

**Unicode and emoji:**
```tsx
// Before
<span>Rating: ★★★☆☆</span>

// After
<span>Rating: ★★★★★</span>
```

**JSX expressions (should NOT be modified as text):**
```tsx
// This contains an expression, not editable as plain text
<p>Hello, {user.name}!</p>

// The text "Hello, " and "!" are separate text nodes
// {user.name} is a JSX expression - not touched by text updates
```

### 4.7 Transaction Tests

**Purpose**: Verify atomic file operations.

**Test cases**:
- Queue file writes
- Overwrite previous queued writes for same file
- Write all queued files on commit
- Clear queued writes after commit
- Restore files from backups on rollback
- Clear all state after rollback

#### Example: Queue file writes

```typescript
const transaction = new Transaction();

// Queue multiple file writes
transaction.write('src/Button.module.css', '.button { padding: 16px; }');
transaction.write('src/Button.tsx', '<button className={styles.button}>Click</button>');

// Files are NOT written yet
expect(await fileExists('src/Button.module.css')).toBe(true); // Original still exists
expect(transaction.pending).toHaveLength(2);

// Nothing on disk has changed
const original = await readFile('src/Button.module.css');
expect(original).not.toContain('padding: 16px');
```

#### Example: Overwrite previous queued writes for same file

```typescript
const transaction = new Transaction();

// First write
transaction.write('src/styles.module.css', '.card { padding: 8px; }');

// Second write to same file (overwrites first)
transaction.write('src/styles.module.css', '.card { padding: 16px; }');

// Only one pending write for this file
expect(transaction.pending).toHaveLength(1);

await transaction.commit();

// Final file has the second value
const result = await readFile('src/styles.module.css');
expect(result).toContain('padding: 16px');
expect(result).not.toContain('padding: 8px');
```

#### Example: Write all queued files on commit

```typescript
const transaction = new Transaction();

transaction.write('src/a.css', '/* file a */');
transaction.write('src/b.css', '/* file b */');
transaction.write('src/c.tsx', '// file c');

// Commit all at once
await transaction.commit();

// All files written atomically
expect(await readFile('src/a.css')).toBe('/* file a */');
expect(await readFile('src/b.css')).toBe('/* file b */');
expect(await readFile('src/c.tsx')).toBe('// file c');
```

#### Example: Clear queued writes after commit

```typescript
const transaction = new Transaction();

transaction.write('src/styles.css', '/* new content */');
expect(transaction.pending).toHaveLength(1);

await transaction.commit();

// Queue is cleared
expect(transaction.pending).toHaveLength(0);
expect(transaction.backups).toHaveLength(0);
```

#### Example: Restore files from backups on rollback

```typescript
// Original file content
await writeFile('src/Button.module.css', '.button { color: blue; }');
await writeFile('src/Button.tsx', '<button>Original</button>');

const transaction = new Transaction();

// Back up originals and queue changes
transaction.write('src/Button.module.css', '.button { color: red; }');
transaction.write('src/Button.tsx', '<button>Modified</button>');

// Commit changes
await transaction.commit();

// Verify changes applied
expect(await readFile('src/Button.module.css')).toContain('color: red');

// Something goes wrong - rollback!
await transaction.rollback();

// Original content restored
expect(await readFile('src/Button.module.css')).toContain('color: blue');
expect(await readFile('src/Button.tsx')).toContain('Original');
```

#### Example: Clear all state after rollback

```typescript
const transaction = new Transaction();

transaction.write('src/a.css', 'new content');
await transaction.commit();

// State exists before rollback
expect(transaction.backups).toHaveLength(1);

await transaction.rollback();

// All state cleared
expect(transaction.pending).toHaveLength(0);
expect(transaction.backups).toHaveLength(0);
expect(transaction.committed).toBe(false);
```

#### Example: Full transaction lifecycle

```typescript
// Scenario: Update button padding (CSS) and add className (JSX)

const transaction = new Transaction();

try {
  // 1. Read and transform CSS
  const css = await readFile('src/Button.module.css');
  const newCss = updateCssProperty(css, '.button', 'padding', '24px');
  transaction.write('src/Button.module.css', newCss);

  // 2. Read and transform JSX
  const jsx = await readFile('src/Button.tsx');
  const newJsx = addClassName(jsx, { line: 5 }, 'large');
  transaction.write('src/Button.tsx', newJsx);

  // 3. Commit both changes atomically
  await transaction.commit();

  return { success: true, modified: ['Button.module.css', 'Button.tsx'] };
} catch (error) {
  // If anything fails, restore originals
  await transaction.rollback();
  throw error;
}
```

### 4.8 Zod Schema Tests

**Purpose**: Verify runtime validation schemas.

**Test cases**:
- Validate valid element targets
- Reject invalid file extensions
- Reject negative line numbers
- Reject selectors without dot prefix
- Reject non-module CSS files
- Validate complete transform requests

#### Example: Validate valid element targets

**Schema:**
```typescript
const ElementTargetSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().nonnegative(),
  selector: z.string().startsWith('.').optional()
});
```

**Valid targets:**
```typescript
// Basic target
const valid1 = { file: 'src/Button.tsx', line: 15, column: 4 };
expect(ElementTargetSchema.parse(valid1)).toEqual(valid1);

// With selector
const valid2 = { file: 'src/Card.tsx', line: 8, column: 2, selector: '.card' };
expect(ElementTargetSchema.parse(valid2)).toEqual(valid2);

// Column at start of line (0 is valid)
const valid3 = { file: 'src/App.tsx', line: 1, column: 0 };
expect(ElementTargetSchema.parse(valid3)).toEqual(valid3);
```

#### Example: Reject invalid file extensions

**Schema:**
```typescript
const CssFileSchema = z.string().regex(/\.module\.css$/, {
  message: 'File must be a CSS Module (.module.css)'
});
```

**Test cases:**
```typescript
// Valid
expect(() => CssFileSchema.parse('button.module.css')).not.toThrow();
expect(() => CssFileSchema.parse('src/styles/Card.module.css')).not.toThrow();

// Invalid - regular CSS
expect(() => CssFileSchema.parse('styles.css'))
  .toThrow('File must be a CSS Module');

// Invalid - SCSS
expect(() => CssFileSchema.parse('styles.module.scss'))
  .toThrow('File must be a CSS Module');

// Invalid - no extension
expect(() => CssFileSchema.parse('styles'))
  .toThrow('File must be a CSS Module');
```

#### Example: Reject negative line numbers

```typescript
const LocationSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().nonnegative()
});

// Valid
expect(() => LocationSchema.parse({ line: 1, column: 0 })).not.toThrow();
expect(() => LocationSchema.parse({ line: 100, column: 50 })).not.toThrow();

// Invalid - line 0
expect(() => LocationSchema.parse({ line: 0, column: 5 }))
  .toThrow(); // Line must be positive (1-indexed)

// Invalid - negative line
expect(() => LocationSchema.parse({ line: -1, column: 5 }))
  .toThrow();

// Invalid - negative column
expect(() => LocationSchema.parse({ line: 5, column: -1 }))
  .toThrow();

// Invalid - float
expect(() => LocationSchema.parse({ line: 5.5, column: 3 }))
  .toThrow(); // Must be integer
```

#### Example: Reject selectors without dot prefix

```typescript
const CssSelectorSchema = z.string().regex(/^\./, {
  message: 'Selector must start with a dot (.className)'
});

// Valid class selectors
expect(() => CssSelectorSchema.parse('.button')).not.toThrow();
expect(() => CssSelectorSchema.parse('.card-header')).not.toThrow();
expect(() => CssSelectorSchema.parse('.MyComponent')).not.toThrow();

// Invalid - no dot prefix
expect(() => CssSelectorSchema.parse('button'))
  .toThrow('Selector must start with a dot');

// Invalid - ID selector
expect(() => CssSelectorSchema.parse('#main'))
  .toThrow('Selector must start with a dot');

// Invalid - element selector
expect(() => CssSelectorSchema.parse('div'))
  .toThrow('Selector must start with a dot');
```

#### Example: Reject non-module CSS files

```typescript
const ModuleCssPathSchema = z.string()
  .refine(path => path.endsWith('.module.css'), {
    message: 'Only CSS Modules are supported'
  })
  .refine(path => !path.includes('node_modules'), {
    message: 'Cannot modify files in node_modules'
  });

// Valid
expect(() => ModuleCssPathSchema.parse('src/Button.module.css')).not.toThrow();

// Invalid - regular CSS
expect(() => ModuleCssPathSchema.parse('src/globals.css'))
  .toThrow('Only CSS Modules are supported');

// Invalid - in node_modules
expect(() => ModuleCssPathSchema.parse('node_modules/lib/style.module.css'))
  .toThrow('Cannot modify files in node_modules');
```

#### Example: Validate complete transform requests

**Schema:**
```typescript
const CssTransformRequestSchema = z.object({
  type: z.literal('css-update'),
  target: ElementTargetSchema,
  cssFile: z.string().endsWith('.module.css'),
  selector: z.string().startsWith('.'),
  property: z.string().min(1),
  value: z.string(),
  preview: z.boolean().optional().default(false)
});
```

**Valid request:**
```typescript
const validRequest = {
  type: 'css-update',
  target: { file: 'src/Button.tsx', line: 10, column: 4 },
  cssFile: 'src/Button.module.css',
  selector: '.button',
  property: 'padding',
  value: '16px'
};

const parsed = CssTransformRequestSchema.parse(validRequest);
expect(parsed.preview).toBe(false); // Default applied
```

**Invalid requests with specific errors:**
```typescript
// Missing required field
const invalid1 = { type: 'css-update', target: {}, cssFile: 'x.module.css' };
// → ZodError: selector is required

// Wrong type literal
const invalid2 = { ...validRequest, type: 'css-delete' };
// → ZodError: Invalid literal value, expected "css-update"

// Invalid nested object
const invalid3 = { ...validRequest, target: { file: '', line: 0, column: 0 } };
// → ZodError: file must be at least 1 character; line must be positive
```

### 4.9 Store Tests

**Purpose**: Verify Zustand store actions.

**Test cases**:
- Select an element
- Clear hover when selecting
- Push command to undo stack
- Clear redo stack on new command
- Move command from undo to redo on undo
- Respect maxStackSize limit
- Clear pending edits for changed file (HMR)
- Clear undo/redo for changed file (HMR)

#### Example: Select an element

```typescript
const { result } = renderHook(() => useEditorStore());

// Initial state
expect(result.current.selectedElement).toBeNull();

// Select an element
act(() => {
  result.current.selectElement({
    file: 'src/Button.tsx',
    line: 15,
    column: 4,
    selector: '.button',
    tagName: 'button',
    computedStyles: { padding: '12px', backgroundColor: '#3b82f6' }
  });
});

expect(result.current.selectedElement).toEqual({
  file: 'src/Button.tsx',
  line: 15,
  column: 4,
  selector: '.button',
  tagName: 'button',
  computedStyles: { padding: '12px', backgroundColor: '#3b82f6' }
});
```

#### Example: Clear hover when selecting

```typescript
const { result } = renderHook(() => useEditorStore());

// Set hover state
act(() => {
  result.current.setHoveredElement({
    file: 'src/Card.tsx',
    line: 8,
    tagName: 'div'
  });
});

expect(result.current.hoveredElement).not.toBeNull();

// Select an element - should clear hover
act(() => {
  result.current.selectElement({
    file: 'src/Button.tsx',
    line: 15,
    tagName: 'button'
  });
});

expect(result.current.hoveredElement).toBeNull();
expect(result.current.selectedElement).not.toBeNull();
```

#### Example: Push command to undo stack

```typescript
const { result } = renderHook(() => useEditorStore());

// Execute a command
const command: EditorCommand = {
  type: 'css-update',
  file: 'src/Button.module.css',
  selector: '.button',
  property: 'padding',
  oldValue: '12px',
  newValue: '16px'
};

act(() => {
  result.current.pushCommand(command);
});

expect(result.current.undoStack).toHaveLength(1);
expect(result.current.undoStack[0]).toEqual(command);
```

#### Example: Clear redo stack on new command

```typescript
const { result } = renderHook(() => useEditorStore());

// Push initial command
act(() => {
  result.current.pushCommand({ type: 'css-update', oldValue: 'a', newValue: 'b' });
});

// Undo it (moves to redo stack)
act(() => {
  result.current.undo();
});

expect(result.current.undoStack).toHaveLength(0);
expect(result.current.redoStack).toHaveLength(1);

// Push new command - should clear redo
act(() => {
  result.current.pushCommand({ type: 'css-update', oldValue: 'b', newValue: 'c' });
});

expect(result.current.undoStack).toHaveLength(1);
expect(result.current.redoStack).toHaveLength(0); // Cleared!
```

#### Example: Move command from undo to redo on undo

```typescript
const { result } = renderHook(() => useEditorStore());

const command1 = { type: 'css-update', id: 1, oldValue: 'a', newValue: 'b' };
const command2 = { type: 'css-update', id: 2, oldValue: 'b', newValue: 'c' };

// Push two commands
act(() => {
  result.current.pushCommand(command1);
  result.current.pushCommand(command2);
});

expect(result.current.undoStack).toHaveLength(2);
expect(result.current.redoStack).toHaveLength(0);

// Undo once
act(() => {
  result.current.undo();
});

expect(result.current.undoStack).toHaveLength(1);
expect(result.current.redoStack).toHaveLength(1);
expect(result.current.redoStack[0].id).toBe(2); // Most recent moved to redo

// Undo again
act(() => {
  result.current.undo();
});

expect(result.current.undoStack).toHaveLength(0);
expect(result.current.redoStack).toHaveLength(2);
```

#### Example: Respect maxStackSize limit

```typescript
const { result } = renderHook(() => useEditorStore());

// Default maxStackSize is 50
const maxStackSize = 50;

// Push more commands than the limit
for (let i = 0; i < maxStackSize + 10; i++) {
  act(() => {
    result.current.pushCommand({
      type: 'css-update',
      id: i,
      oldValue: String(i),
      newValue: String(i + 1)
    });
  });
}

// Stack should be capped at maxStackSize
expect(result.current.undoStack).toHaveLength(maxStackSize);

// Oldest commands should be removed (FIFO)
expect(result.current.undoStack[0].id).toBe(10); // Commands 0-9 dropped
expect(result.current.undoStack[maxStackSize - 1].id).toBe(59); // Latest kept
```

#### Example: Clear pending edits for changed file (HMR)

```typescript
const { result } = renderHook(() => useEditorStore());

// User makes edits to Button.module.css
act(() => {
  result.current.setPendingEdit('src/Button.module.css', {
    selector: '.button',
    property: 'padding',
    value: '20px'
  });
});

expect(result.current.pendingEdits['src/Button.module.css']).toBeDefined();

// File changes externally (HMR event)
act(() => {
  result.current.handleFileChange('src/Button.module.css');
});

// Pending edits for that file are cleared
expect(result.current.pendingEdits['src/Button.module.css']).toBeUndefined();

// Other files' pending edits are preserved
expect(result.current.pendingEdits['src/Card.module.css']).toBeDefined();
```

#### Example: Clear undo/redo for changed file (HMR)

```typescript
const { result } = renderHook(() => useEditorStore());

// Build up undo stack with commands for multiple files
act(() => {
  result.current.pushCommand({
    type: 'css-update',
    file: 'src/Button.module.css',
    oldValue: 'a',
    newValue: 'b'
  });
  result.current.pushCommand({
    type: 'css-update',
    file: 'src/Card.module.css',
    oldValue: 'x',
    newValue: 'y'
  });
  result.current.pushCommand({
    type: 'css-update',
    file: 'src/Button.module.css',
    oldValue: 'b',
    newValue: 'c'
  });
});

expect(result.current.undoStack).toHaveLength(3);

// External change to Button.module.css
act(() => {
  result.current.handleFileChange('src/Button.module.css');
});

// Only commands for Button.module.css are removed
expect(result.current.undoStack).toHaveLength(1);
expect(result.current.undoStack[0].file).toBe('src/Card.module.css');
```

---

## 5. Integration Tests

Integration tests verify multiple modules working together.

### 5.1 Transform Flow Integration

**Purpose**: Verify complete transform operations from WebSocket to file system.

**Test cases**:
- Update CSS property and return success
- Create variant and update JSX atomically
- Rollback all changes on failure

#### Example: Update CSS property and return success

```typescript
// Setup: Create test files
await writeFile('src/Button.module.css', `
.button {
  padding: 12px;
  background-color: #3b82f6;
}
`);

// Send transform request via WebSocket
const request = {
  action: 'transform',
  payload: {
    type: 'css-update',
    target: { file: 'src/Button.tsx', line: 8, column: 4 },
    cssFile: 'src/Button.module.css',
    selector: '.button',
    property: 'padding',
    value: '24px'
  }
};

const response = await sendMessage(ws, request);

// Verify response
expect(response.success).toBe(true);
expect(response.modified).toContain('src/Button.module.css');

// Verify file was updated
const updatedCss = await readFile('src/Button.module.css');
expect(updatedCss).toContain('padding: 24px');
expect(updatedCss).toContain('background-color: #3b82f6'); // Other props preserved
```

#### Example: Create variant and update JSX atomically

```typescript
// Setup: Initial files
await writeFile('src/Card.module.css', `
.card {
  padding: 16px;
  border-radius: 8px;
}
`);

await writeFile('src/Card.tsx', `
import styles from './Card.module.css';

export function Card({ children }) {
  return <div className={styles.card}>{children}</div>;
}
`);

// Request: Create "elevated" variant and apply it
const request = {
  action: 'transform',
  payload: {
    type: 'add-variant',
    target: { file: 'src/Card.tsx', line: 5, column: 10 },
    cssFile: 'src/Card.module.css',
    baseSelector: '.card',
    variantName: 'elevated',
    styles: { boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
    applyToElement: true
  }
};

const response = await sendMessage(ws, request);

expect(response.success).toBe(true);
expect(response.modified).toEqual(['src/Card.module.css', 'src/Card.tsx']);

// Verify CSS has new variant
const css = await readFile('src/Card.module.css');
expect(css).toContain('.elevated');
expect(css).toContain('box-shadow');

// Verify JSX was updated
const jsx = await readFile('src/Card.tsx');
expect(jsx).toContain('styles.elevated');
```

#### Example: Rollback all changes on failure

```typescript
// Setup: Create valid CSS, but JSX will fail transformation
await writeFile('src/Broken.module.css', `.button { padding: 12px; }`);
await writeFile('src/Broken.tsx', `
// This file has syntax that will cause JSX transform to fail
export function Broken() {
  return <div className={styles.button} // Missing closing
}
`);

const originalCss = await readFile('src/Broken.module.css');

// Request that will partially succeed (CSS) then fail (JSX)
const request = {
  action: 'transform',
  payload: {
    type: 'add-variant',
    target: { file: 'src/Broken.tsx', line: 4, column: 10 },
    cssFile: 'src/Broken.module.css',
    baseSelector: '.button',
    variantName: 'large',
    styles: { padding: '24px' },
    applyToElement: true  // This will fail on broken JSX
  }
};

const response = await sendMessage(ws, request);

expect(response.success).toBe(false);
expect(response.error.code).toBe('JSX_PARSE_ERROR');

// CSS should be rolled back to original (even though CSS transform succeeded)
const css = await readFile('src/Broken.module.css');
expect(css).toBe(originalCss);
expect(css).not.toContain('.large'); // Variant was not added
```

### 5.2 File Watcher Integration

**Purpose**: Verify file system change detection.

**Test cases**:
- Invalidate AST cache when file is modified
- Debounce rapid changes
- Handle file creation and deletion

#### Example: Invalidate AST cache when file is modified

```typescript
const watcher = new FileWatcher({ root: testDir });
const cache = new AstCache();

// Parse and cache a file
const css = await readFile('src/Button.module.css');
const ast = cache.getOrParse('src/Button.module.css', css);
expect(cache.has('src/Button.module.css')).toBe(true);

// Modify the file externally (simulating IDE edit)
await writeFile('src/Button.module.css', `
.button {
  padding: 24px; /* Changed! */
}
`);

// Wait for watcher to detect change
await waitFor(() => watcher.lastEvent !== null);

// Cache should be invalidated
expect(cache.has('src/Button.module.css')).toBe(false);

// Next access re-parses the file
const newAst = cache.getOrParse('src/Button.module.css', await readFile('src/Button.module.css'));
expect(newAst).not.toBe(ast); // New AST instance
```

#### Example: Debounce rapid changes

```typescript
const watcher = new FileWatcher({ root: testDir, debounceMs: 100 });
const events: string[] = [];

watcher.on('change', (file) => events.push(file));

// Rapid successive writes (simulating auto-save or formatter)
await writeFile('src/styles.css', 'v1');
await sleep(10);
await writeFile('src/styles.css', 'v2');
await sleep(10);
await writeFile('src/styles.css', 'v3');
await sleep(10);
await writeFile('src/styles.css', 'v4');

// Wait for debounce to settle
await sleep(150);

// Only one event should fire (debounced)
expect(events).toHaveLength(1);
expect(events[0]).toBe('src/styles.css');
```

#### Example: Handle file creation and deletion

```typescript
const watcher = new FileWatcher({ root: testDir });
const events: Array<{ type: string; file: string }> = [];

watcher.on('create', (file) => events.push({ type: 'create', file }));
watcher.on('delete', (file) => events.push({ type: 'delete', file }));
watcher.on('change', (file) => events.push({ type: 'change', file }));

// Create a new file
await writeFile('src/NewComponent.module.css', '.new { color: red; }');
await waitFor(() => events.length >= 1);

expect(events[0]).toEqual({ type: 'create', file: 'src/NewComponent.module.css' });

// Modify the file
await writeFile('src/NewComponent.module.css', '.new { color: blue; }');
await waitFor(() => events.length >= 2);

expect(events[1]).toEqual({ type: 'change', file: 'src/NewComponent.module.css' });

// Delete the file
await deleteFile('src/NewComponent.module.css');
await waitFor(() => events.length >= 3);

expect(events[2]).toEqual({ type: 'delete', file: 'src/NewComponent.module.css' });
```

### 5.3 WebSocket Protocol Testing

**Purpose**: Verify all WebSocket message types.

**Actions tested**:
- `get-project` - Returns project metadata
- `get-variants` - Returns variants for CSS file
- `preview` - Returns preview without applying changes
- `transform` - Applies CSS/JSX changes
- `ping` - Health check responds with pong

#### Example: get-project - Returns project metadata

```typescript
const ws = await connectWebSocket('ws://localhost:3001');

const response = await sendMessage(ws, {
  action: 'get-project'
});

expect(response.success).toBe(true);
expect(response.data).toEqual({
  name: 'my-app',
  root: '/path/to/project',
  framework: 'react',
  cssModules: true,
  typescript: true,
  files: {
    components: expect.any(Number),
    cssModules: expect.any(Number)
  }
});
```

#### Example: get-variants - Returns variants for CSS file

```typescript
// Setup: CSS file with variants
await writeFile('src/Button.module.css', `
.button {
  padding: 12px;
  background: blue;
}

.large {
  padding: 20px;
  font-size: 18px;
}

.small {
  padding: 6px;
  font-size: 12px;
}

.primary {
  background: #3b82f6;
}

.secondary {
  background: #6b7280;
}
`);

const response = await sendMessage(ws, {
  action: 'get-variants',
  payload: {
    cssFile: 'src/Button.module.css',
    baseSelector: '.button'
  }
});

expect(response.success).toBe(true);
expect(response.data.variants).toEqual([
  { name: 'large', selector: '.large' },
  { name: 'small', selector: '.small' },
  { name: 'primary', selector: '.primary' },
  { name: 'secondary', selector: '.secondary' }
]);
```

#### Example: preview - Returns preview without applying changes

```typescript
await writeFile('src/Card.module.css', `
.card {
  padding: 16px;
  border-radius: 8px;
}
`);

const response = await sendMessage(ws, {
  action: 'preview',
  payload: {
    type: 'css-update',
    cssFile: 'src/Card.module.css',
    selector: '.card',
    property: 'padding',
    value: '24px'
  }
});

expect(response.success).toBe(true);

// Preview returns what the file WOULD look like
expect(response.data.preview).toContain('padding: 24px');
expect(response.data.preview).toContain('border-radius: 8px');

// But file is NOT modified
const actualFile = await readFile('src/Card.module.css');
expect(actualFile).toContain('padding: 16px'); // Original value
```

#### Example: transform - Applies CSS/JSX changes

```typescript
await writeFile('src/Header.module.css', `
.header {
  height: 64px;
  background: white;
}
`);

const response = await sendMessage(ws, {
  action: 'transform',
  payload: {
    type: 'css-update',
    target: { file: 'src/Header.tsx', line: 5, column: 4 },
    cssFile: 'src/Header.module.css',
    selector: '.header',
    property: 'height',
    value: '80px'
  }
});

expect(response.success).toBe(true);
expect(response.modified).toContain('src/Header.module.css');

// File is actually modified
const updatedFile = await readFile('src/Header.module.css');
expect(updatedFile).toContain('height: 80px');
```

#### Example: ping - Health check responds with pong

```typescript
const ws = await connectWebSocket('ws://localhost:3001');

const startTime = Date.now();
const response = await sendMessage(ws, { action: 'ping' });
const endTime = Date.now();

expect(response).toEqual({
  action: 'pong',
  timestamp: expect.any(Number)
});

// Response should be fast (health check)
expect(endTime - startTime).toBeLessThan(100);
```

#### Example: Error handling for invalid actions

```typescript
const response = await sendMessage(ws, {
  action: 'unknown-action',
  payload: {}
});

expect(response.success).toBe(false);
expect(response.error).toEqual({
  code: 'UNKNOWN_ACTION',
  message: "Unknown action: 'unknown-action'"
});
```

#### Example: Error handling for malformed payloads

```typescript
// Missing required field
const response = await sendMessage(ws, {
  action: 'transform',
  payload: {
    type: 'css-update',
    // Missing: target, cssFile, selector, property, value
  }
});

expect(response.success).toBe(false);
expect(response.error.code).toBe('VALIDATION_ERROR');
expect(response.error.details).toContain('target');
```

---

## 6. End-to-End Tests

E2E tests verify complete user workflows in a real browser.

### 6.1 Phase-Aligned E2E Tests

Each implementation phase has corresponding E2E tests validating the full vertical slice.

**Phase 2: Text Editing**
- Click element shows selection overlay
- Double-click activates contentEditable
- Edit text updates source file
- Cancel edit with Escape reverts changes

#### Example: Phase 2 - Text Editing Flow

```typescript
import { test, expect } from '@playwright/test';

test('edit text via double-click updates source file', async ({ page }) => {
  // Navigate to app with Alara enabled
  await page.goto('http://localhost:3000?alara=true');

  // Find a text element
  const heading = page.getByRole('heading', { name: 'Welcome to Our App' });

  // Single click - shows selection overlay
  await heading.click();
  await expect(page.locator('[data-alara-selection]')).toBeVisible();

  // Double-click - activates contentEditable
  await heading.dblclick();
  await expect(heading).toHaveAttribute('contenteditable', 'true');

  // Edit the text
  await heading.fill('Welcome to Alara Builder');
  await heading.press('Enter'); // Confirm edit

  // Wait for file update
  await expect(page.locator('[data-alara-saving]')).toBeHidden();

  // Verify source file was updated
  const fileContent = await readFile('src/components/Hero.tsx');
  expect(fileContent).toContain('Welcome to Alara Builder');
});

test('cancel edit with Escape reverts changes', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  const heading = page.getByRole('heading', { name: 'Original Text' });
  await heading.dblclick();

  // Type new text
  await heading.fill('Modified Text');

  // Press Escape to cancel
  await page.keyboard.press('Escape');

  // Text should revert
  await expect(heading).toHaveText('Original Text');

  // File should NOT be modified
  const fileContent = await readFile('src/components/Header.tsx');
  expect(fileContent).toContain('Original Text');
  expect(fileContent).not.toContain('Modified Text');
});
```

**Phase 3: CSS Spacing**
- Toolbox appears when element selected
- Spacing panel displays current padding
- Change padding updates CSS file via HMR

#### Example: Phase 3 - CSS Spacing Flow

```typescript
test('change padding via spacing panel updates CSS file', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Select a card element
  const card = page.locator('[data-testid="product-card"]');
  await card.click();

  // Toolbox should appear
  const toolbox = page.locator('[data-alara-toolbox]');
  await expect(toolbox).toBeVisible();

  // Open spacing panel
  await toolbox.getByRole('tab', { name: 'Spacing' }).click();

  // Current padding should be displayed
  const paddingInput = toolbox.getByLabel('Padding');
  await expect(paddingInput).toHaveValue('16px');

  // Change padding
  await paddingInput.fill('24px');
  await paddingInput.press('Enter');

  // Wait for HMR
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-testid="product-card"]');
    return getComputedStyle(card).padding === '24px';
  });

  // Verify CSS file was updated
  const cssContent = await readFile('src/components/Card.module.css');
  expect(cssContent).toContain('padding: 24px');
});
```

**Phase 4: CSS Colors**
- Color picker opens on swatch click
- CSS variable hints show variable names
- Change color updates CSS file

#### Example: Phase 4 - CSS Colors Flow

```typescript
test('color picker updates background color', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Select button element
  const button = page.getByRole('button', { name: 'Submit' });
  await button.click();

  // Open colors panel in toolbox
  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Colors' }).click();

  // Click background color swatch
  const bgSwatch = toolbox.locator('[data-property="background-color"]');
  await bgSwatch.click();

  // Color picker should open
  const colorPicker = page.locator('[data-alara-color-picker]');
  await expect(colorPicker).toBeVisible();

  // Select a new color
  await colorPicker.getByLabel('Hex').fill('#ef4444');
  await colorPicker.getByRole('button', { name: 'Apply' }).click();

  // Wait for HMR
  await expect(button).toHaveCSS('background-color', 'rgb(239, 68, 68)');

  // Verify CSS file
  const cssContent = await readFile('src/components/Button.module.css');
  expect(cssContent).toContain('#ef4444');
});

test('CSS variable hints show variable names', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Select element using CSS variable
  const header = page.locator('[data-testid="header"]');
  await header.click();

  // Open colors panel
  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Colors' }).click();

  // Hover over color swatch
  const bgSwatch = toolbox.locator('[data-property="background-color"]');
  await bgSwatch.hover();

  // Should show variable name hint
  const tooltip = page.locator('[data-alara-tooltip]');
  await expect(tooltip).toContainText('var(--color-primary)');
});
```

### 6.2 Visual Editing E2E

**Test cases**:
- Select element on click
- Show hover overlay on mouseover
- Update padding via properties panel
- Update text via double-click
- Show color picker for background

#### Example: Select element on click

```typescript
test('select element on click shows selection overlay', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Initially no selection
  await expect(page.locator('[data-alara-selection]')).not.toBeVisible();

  // Click on a button
  const button = page.getByRole('button', { name: 'Click me' });
  await button.click();

  // Selection overlay should appear around the button
  const selection = page.locator('[data-alara-selection]');
  await expect(selection).toBeVisible();

  // Selection should match button's bounding box
  const buttonBox = await button.boundingBox();
  const selectionBox = await selection.boundingBox();
  expect(selectionBox.x).toBeCloseTo(buttonBox.x, 1);
  expect(selectionBox.y).toBeCloseTo(buttonBox.y, 1);
  expect(selectionBox.width).toBeCloseTo(buttonBox.width, 1);
});
```

#### Example: Show hover overlay on mouseover

```typescript
test('show hover overlay on mouseover', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Hover over an element
  const card = page.locator('[data-testid="product-card"]');
  await card.hover();

  // Hover overlay should appear
  const hoverOverlay = page.locator('[data-alara-hover]');
  await expect(hoverOverlay).toBeVisible();

  // Move mouse away
  await page.mouse.move(0, 0);

  // Hover overlay should disappear
  await expect(hoverOverlay).not.toBeVisible();
});
```

#### Example: Update padding via properties panel

```typescript
test('update padding via properties panel', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Select element
  const card = page.locator('[data-testid="card"]');
  await card.click();

  // Open spacing in toolbox
  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Spacing' }).click();

  // Get individual padding inputs
  const paddingTop = toolbox.getByLabel('Padding Top');
  const paddingRight = toolbox.getByLabel('Padding Right');
  const paddingBottom = toolbox.getByLabel('Padding Bottom');
  const paddingLeft = toolbox.getByLabel('Padding Left');

  // Change padding-left only
  await paddingLeft.fill('32px');
  await paddingLeft.press('Enter');

  // Verify visual change
  await expect(card).toHaveCSS('padding-left', '32px');
  await expect(card).toHaveCSS('padding-top', '16px'); // Others unchanged
});
```

### 6.3 Undo/Redo E2E

**Test cases**:
- Undo style change
- Redo after undo
- Clear redo stack on new action

#### Example: Undo style change

```typescript
test('undo style change restores previous value', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Select button and change its color
  const button = page.getByRole('button', { name: 'Submit' });
  await button.click();

  // Get original color
  const originalColor = await button.evaluate(el =>
    getComputedStyle(el).backgroundColor
  );

  // Change color via toolbox
  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Colors' }).click();
  await toolbox.locator('[data-property="background-color"]').click();
  await page.locator('[data-alara-color-picker]').getByLabel('Hex').fill('#ef4444');
  await page.getByRole('button', { name: 'Apply' }).click();

  // Verify color changed
  await expect(button).toHaveCSS('background-color', 'rgb(239, 68, 68)');

  // Press Cmd/Ctrl+Z to undo
  await page.keyboard.press('ControlOrMeta+z');

  // Color should revert
  const revertedColor = await button.evaluate(el =>
    getComputedStyle(el).backgroundColor
  );
  expect(revertedColor).toBe(originalColor);
});
```

#### Example: Redo after undo

```typescript
test('redo after undo restores the change', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  const card = page.locator('[data-testid="card"]');
  await card.click();

  // Change padding
  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Spacing' }).click();
  await toolbox.getByLabel('Padding').fill('32px');
  await toolbox.getByLabel('Padding').press('Enter');

  await expect(card).toHaveCSS('padding', '32px');

  // Undo
  await page.keyboard.press('ControlOrMeta+z');
  await expect(card).toHaveCSS('padding', '16px'); // Original

  // Redo
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(card).toHaveCSS('padding', '32px'); // Change restored
});
```

#### Example: Clear redo stack on new action

```typescript
test('new action clears redo stack', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  const button = page.getByRole('button', { name: 'Submit' });
  await button.click();

  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Spacing' }).click();

  // Action 1: Change padding to 20px
  await toolbox.getByLabel('Padding').fill('20px');
  await toolbox.getByLabel('Padding').press('Enter');

  // Undo Action 1
  await page.keyboard.press('ControlOrMeta+z');
  await expect(button).toHaveCSS('padding', '12px'); // Original

  // Action 2: Change padding to 30px (different value)
  await toolbox.getByLabel('Padding').fill('30px');
  await toolbox.getByLabel('Padding').press('Enter');

  // Try to redo - should do nothing (redo stack was cleared)
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(button).toHaveCSS('padding', '30px'); // Still 30px, not 20px
});
```

### 6.4 Variant Creation E2E

**Test cases**:
- Create new variant
- Apply variant to element
- Show validation error for invalid variant name

#### Example: Create new variant

```typescript
test('create new variant via context menu', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Right-click on button element
  const button = page.getByRole('button', { name: 'Primary' });
  await button.click({ button: 'right' });

  // Context menu should appear
  const contextMenu = page.locator('[data-alara-context-menu]');
  await expect(contextMenu).toBeVisible();

  // Click "Create Variant"
  await contextMenu.getByText('Create Variant').click();

  // Variant dialog should open
  const dialog = page.locator('[data-alara-variant-dialog]');
  await expect(dialog).toBeVisible();

  // Enter variant name
  await dialog.getByLabel('Variant Name').fill('danger');

  // Add styles
  await dialog.getByLabel('Background Color').fill('#ef4444');

  // Create the variant
  await dialog.getByRole('button', { name: 'Create' }).click();

  // Dialog should close
  await expect(dialog).not.toBeVisible();

  // Verify CSS file was updated
  const cssContent = await readFile('src/components/Button.module.css');
  expect(cssContent).toContain('.danger');
  expect(cssContent).toContain('#ef4444');
});
```

#### Example: Apply variant to element

```typescript
test('apply variant to element updates className', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Select button
  const button = page.getByRole('button', { name: 'Click me' });
  await button.click();

  // Open variants panel
  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Variants' }).click();

  // Available variants should be listed
  const variantsList = toolbox.locator('[data-alara-variants-list]');
  await expect(variantsList.getByText('large')).toBeVisible();
  await expect(variantsList.getByText('small')).toBeVisible();

  // Click to apply "large" variant
  await variantsList.getByText('large').click();

  // Button should now have the large styles
  await expect(button).toHaveCSS('padding', '16px 32px');
  await expect(button).toHaveCSS('font-size', '18px');

  // JSX should be updated
  const jsxContent = await readFile('src/components/Button.tsx');
  expect(jsxContent).toContain('styles.large');
});
```

#### Example: Show validation error for invalid variant name

```typescript
test('show validation error for invalid variant name', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Open variant dialog
  const button = page.getByRole('button', { name: 'Submit' });
  await button.click({ button: 'right' });
  await page.locator('[data-alara-context-menu]').getByText('Create Variant').click();

  const dialog = page.locator('[data-alara-variant-dialog]');
  const nameInput = dialog.getByLabel('Variant Name');

  // Try invalid names
  await nameInput.fill('123invalid'); // Starts with number
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByText('must start with a letter')).toBeVisible();

  await nameInput.fill('has spaces');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByText('cannot contain spaces')).toBeVisible();

  await nameInput.fill('primary'); // Already exists
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByText('already exists')).toBeVisible();
});
```

### 6.5 External Changes E2E

**Purpose**: Verify handling of file changes outside Alara (IDE, git).

**Test cases**:
- Update UI when file is modified externally
- Clear pending edits on external change
- Clear undo stack for modified file

#### Example: Update UI when file is modified externally

```typescript
test('UI updates when CSS file is modified externally', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  const button = page.getByRole('button', { name: 'Submit' });

  // Initial state
  await expect(button).toHaveCSS('padding', '12px');

  // Modify file externally (simulating IDE edit)
  await writeFile('src/components/Button.module.css', `
.button {
  padding: 24px;
  background-color: #3b82f6;
}
`);

  // Wait for HMR to pick up the change
  await expect(button).toHaveCSS('padding', '24px');

  // Select the button - toolbox should show new value
  await button.click();
  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Spacing' }).click();
  await expect(toolbox.getByLabel('Padding')).toHaveValue('24px');
});
```

#### Example: Clear pending edits on external change

```typescript
test('clear pending edits when file changes externally', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Start editing
  const button = page.getByRole('button', { name: 'Submit' });
  await button.click();

  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Spacing' }).click();

  // Type in padding input but don't press Enter (pending edit)
  await toolbox.getByLabel('Padding').fill('32px');

  // Pending indicator should show
  await expect(toolbox.locator('[data-alara-pending]')).toBeVisible();

  // External change happens
  await writeFile('src/components/Button.module.css', `
.button {
  padding: 20px;
}
`);

  // Wait for external change notification
  await expect(page.locator('[data-alara-external-change]')).toBeVisible();

  // Pending edit should be cleared, showing new external value
  await expect(toolbox.getByLabel('Padding')).toHaveValue('20px');
  await expect(toolbox.locator('[data-alara-pending]')).not.toBeVisible();
});
```

#### Example: Clear undo stack for modified file

```typescript
test('clear undo stack when file is modified externally', async ({ page }) => {
  await page.goto('http://localhost:3000?alara=true');

  // Make some changes via Alara
  const button = page.getByRole('button', { name: 'Submit' });
  await button.click();

  const toolbox = page.locator('[data-alara-toolbox]');
  await toolbox.getByRole('tab', { name: 'Spacing' }).click();
  await toolbox.getByLabel('Padding').fill('24px');
  await toolbox.getByLabel('Padding').press('Enter');

  await expect(button).toHaveCSS('padding', '24px');

  // Undo should work
  await page.keyboard.press('ControlOrMeta+z');
  await expect(button).toHaveCSS('padding', '12px');

  // Redo to get back to 24px
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(button).toHaveCSS('padding', '24px');

  // External change happens
  await writeFile('src/components/Button.module.css', `
.button {
  padding: 16px; /* Someone else changed it */
}
`);

  // Wait for HMR
  await expect(button).toHaveCSS('padding', '16px');

  // Undo should NOT work (stack was cleared for this file)
  await page.keyboard.press('ControlOrMeta+z');
  await expect(button).toHaveCSS('padding', '16px'); // Still 16px

  // Toast notification should inform user
  await expect(page.locator('[data-alara-toast]')).toContainText(
    'Undo history cleared due to external changes'
  );
});
```

---

## 7. Test Fixtures & Mocks

### 7.1 CSS Fixtures

**button.module.css** - Standard button with variants (.large, .small)
**with-variables.module.css** - Uses CSS custom properties
**malformed.css** - Intentional syntax errors for error handling tests

### 7.2 JSX Fixtures

**Button.tsx** - Simple component with CSS Module import
**WithVariants.tsx** - Component using multiple className classes

### 7.3 WebSocket Mock

A mock WebSocket implementation for testing client-side code without a real server:
- Tracks sent messages
- Simulates message, open, close, error events
- Provides test helpers for inspection

### 7.4 Test Helpers

Utility functions for tests:
- `readFixture(path)` - Read fixture file contents
- `createElementTarget(overrides)` - Create mock ElementTarget
- `createMockDOMElement(tag)` - Create DOM element with oid/css attributes
- `createTestContext()` - Create TransformContext with mocks
- `waitFor(condition, timeout)` - Wait for async condition

---

## 8. Critical Test Cases

### 8.1 CSS Transformation Test Matrix

| Test Case | Priority |
|-----------|----------|
| Update existing property | Critical |
| Add new property | Critical |
| Remove property | High |
| Preserve comments | Critical |
| Preserve formatting | Critical |
| Handle CSS variables | High |
| Multiple selectors | High |
| Media queries | Medium |
| Invalid CSS | Critical |

### 8.2 JSX Transformation Test Matrix

| Test Case | Priority |
|-----------|----------|
| Simple className | Critical |
| Template literal | Critical |
| Preserve props | Critical |
| Preserve children | Critical |
| Self-closing element | High |
| Nested elements | High |
| Conditional className | High |
| Text update | Critical |
| Missing className | High |

### 8.3 Undo/Redo Test Matrix

| Test Case | Priority |
|-----------|----------|
| Single undo | Critical |
| Single redo | Critical |
| Multiple undo | Critical |
| New action clears redo | Critical |
| External change clears | Critical |
| Max stack size | Medium |
| Cross-file undo | High |

---

## 9. CI/CD Integration

### 9.1 GitHub Actions Jobs

1. **unit-tests** - Run unit tests with coverage
2. **integration-tests** - Run integration tests
3. **e2e-tests** - Run Playwright with artifact upload on failure
4. **type-check** - TypeScript type checking

### 9.2 Pre-commit Hooks

Using husky and lint-staged:
- ESLint fix on TypeScript files
- Run related tests on changed files
- Prettier format on CSS, JSON, MD files

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
