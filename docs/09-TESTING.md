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

### 4.2 Add Variant Handler Tests

**Purpose**: Verify variant creation in CSS Modules.

**Test cases**:
- Create a new variant class with styles
- Throw `VARIANT_ALREADY_EXISTS` if class name conflicts
- Generate valid CSS class names
- Position new variant after base class

### 4.3 Transform Registry Tests

**Purpose**: Verify handler registration and dispatch.

**Test cases**:
- Register and execute handlers
- Throw for unknown handler types
- Validate requests with Zod schemas
- List registered handler types

### 4.4 CSS Utilities Tests

**Purpose**: Verify CSS parsing and manipulation helpers.

**Test cases**:
- Find rules by exact selector
- Handle CSS Modules hashed selectors
- Parse shorthand values into components
- Convert between value formats

### 4.5 JSX Utilities Tests

**Purpose**: Verify JSX/TSX manipulation helpers.

**Test cases**:
- Convert simple className to template literal
- Add to existing template literal
- Preserve other props during modification
- Find elements at specific line numbers
- Handle self-closing elements

### 4.6 Text Update Handler Tests

**Purpose**: Verify JSX text content updates.

**Test cases**:
- Replace text content in JSX
- Handle text with leading/trailing whitespace
- Throw `TEXT_NOT_FOUND` when text doesn't exist
- Handle special characters in text

### 4.7 Transaction Tests

**Purpose**: Verify atomic file operations.

**Test cases**:
- Queue file writes
- Overwrite previous queued writes for same file
- Write all queued files on commit
- Clear queued writes after commit
- Restore files from backups on rollback
- Clear all state after rollback

### 4.8 Zod Schema Tests

**Purpose**: Verify runtime validation schemas.

**Test cases**:
- Validate valid element targets
- Reject invalid file extensions
- Reject negative line numbers
- Reject selectors without dot prefix
- Reject non-module CSS files
- Validate complete transform requests

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

---

## 5. Integration Tests

Integration tests verify multiple modules working together.

### 5.1 Transform Flow Integration

**Purpose**: Verify complete transform operations from WebSocket to file system.

**Test cases**:
- Update CSS property and return success
- Create variant and update JSX atomically
- Rollback all changes on failure

### 5.2 File Watcher Integration

**Purpose**: Verify file system change detection.

**Test cases**:
- Invalidate AST cache when file is modified
- Debounce rapid changes
- Handle file creation and deletion

### 5.3 WebSocket Protocol Testing

**Purpose**: Verify all WebSocket message types.

**Actions tested**:
- `get-project` - Returns project metadata
- `get-variants` - Returns variants for CSS file
- `preview` - Returns preview without applying changes
- `transform` - Applies CSS/JSX changes
- `ping` - Health check responds with pong

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

**Phase 3: CSS Spacing**
- Toolbox appears when element selected
- Spacing panel displays current padding
- Change padding updates CSS file via HMR

**Phase 4: CSS Colors**
- Color picker opens on swatch click
- CSS variable hints show variable names
- Change color updates CSS file

### 6.2 Visual Editing E2E

**Test cases**:
- Select element on click
- Show hover overlay on mouseover
- Update padding via properties panel
- Update text via double-click
- Show color picker for background

### 6.3 Undo/Redo E2E

**Test cases**:
- Undo style change
- Redo after undo
- Clear redo stack on new action

### 6.4 Variant Creation E2E

**Test cases**:
- Create new variant
- Apply variant to element
- Show validation error for invalid variant name

### 6.5 External Changes E2E

**Purpose**: Verify handling of file changes outside Alara (IDE, git).

**Test cases**:
- Update UI when file is modified externally
- Clear pending edits on external change
- Clear undo stack for modified file

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
