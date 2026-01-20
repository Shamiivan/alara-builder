# Alara Builder - Technical Design Documentation

## Overview

Alara Builder is a bidirectional design-to-code sync engine that enables visual editing of React websites with real-time code synchronization. Users can visually edit elements (text, spacing, colors, typography) in a browser and have changes instantly reflected in source code files (CSS Modules + JSX).
These docs are a starting place in terms of architecture and design. they are gonna evolve as the project progresses.

## Document Index

| Document | Description | Status |
|----------|-------------|--------|
| [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) | High-level system architecture, package structure, data flows | In Review |
| [02-MODULE-DESIGN.md](./02-MODULE-DESIGN.md) | Transform Registry, Handlers, Store, Components - with code examples | In Review |
| [03-INTERFACES.md](./03-INTERFACES.md) | WebSocket protocol, TypeScript types, error codes | In Review |
| [04-DATA-DESIGN.md](./04-DATA-DESIGN.md) | Zustand store, AST cache, Zod schemas, data flow diagrams | In Review |
| [05-ALGORITHMS.md](./05-ALGORITHMS.md) | CSS/JSX transformation algorithms, sync logic | In Review |
| [06-UI-DESIGN.md](./06-UI-DESIGN.md) | Component hierarchy, properties panel structure | In Review |
| [07-ERROR-HANDLING.md](./07-ERROR-HANDLING.md) | Error taxonomy, recovery strategies, user feedback | In Review |
| [08-SECURITY.md](./08-SECURITY.md) | Input validation, file access controls | Pending |
| [09-TESTING.md](./09-TESTING.md) | Testing strategy, test cases, CI/CD integration | In Review |

## Tech Stack Summary

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Browser)                      │
├─────────────────────────────────────────────────────────────┤
│  React          │ UI components, properties panel           │
│  Zustand        │ State management (selection, pending edits)│
│  CSS Modules    │ Styling (no inline styles, no Tailwind)   │
│  Vite HMR       │ Hot module replacement for live updates   │
└─────────────────────────────────────────────────────────────┘
                              ▼ WebSocket
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Bun Runtime)                     │
├─────────────────────────────────────────────────────────────┤
│  ts-morph       │ JSX/TSX AST manipulation                  │
│  PostCSS        │ CSS file parsing and transformation       │
│  css-tree       │ CSS value parsing (typed values)          │
│  colorjs.io     │ Color parsing and color space conversion  │
│  Vite Plugin    │ Metadata injection, HMR integration       │
│  File Watchers  │ Code → Visual sync (chokidar/Bun.watch)   │
└─────────────────────────────────────────────────────────────┘
                              ▼ File System
┌─────────────────────────────────────────────────────────────┐
│                     USER PROJECT FILES                       │
├─────────────────────────────────────────────────────────────┤
│  src/components/**/*.tsx     │ React components             │
│  src/components/**/*.module.css │ CSS Module styles         │
│  src/pages/**/*.tsx          │ Page components              │
└─────────────────────────────────────────────────────────────┘
```

## Key Constraints

1. **CSS Modules Only** - No inline styles, no Tailwind, no CSS-in-JS
2. **Last Write Wins** - if there is a conflict between visual edits and code edits. the visual will prompt the user to resolve the conflict.
3. **Local Only** - Files on disk, no cloud dependencies
4. **Variant Classes** - Style changes create named, reusable CSS classes
5. **Dev Mode Only** - Metadata injection disabled in production builds. This is a development tool, not a production feature.

## Key Design Decisions

The following design decisions have been made and documented:

- [x] **WebSocket Protocol**: JSON messages with discriminated unions (see [03-INTERFACES.md](./03-INTERFACES.md))
- [x] **AST Caching**: LRU cache with 50MB/100 entry limit, file-based invalidation (see [05-ALGORITHMS.md](./05-ALGORITHMS.md))
- [x] **Undo/Redo**: Command pattern with compression for rapid edits (see [04-DATA-DESIGN.md](./04-DATA-DESIGN.md), [05-ALGORITHMS.md](./05-ALGORITHMS.md))
- [x] **Concurrent Edits**: Last write wins - external code changes invalidate pending visual edits (see [05-ALGORITHMS.md](./05-ALGORITHMS.md))
- [x] **Element Identification**: Build-time `oid` attribute injection with OID registry for direct source mapping (see [05-ALGORITHMS.md](./05-ALGORITHMS.md))
- [x] **Canvas Rendering**: Direct rendering (no iframe), Shadow DOM isolation (see [01-ARCHITECTURE.md](./01-ARCHITECTURE.md))
- [x] **Runtime Validation**: Zod schemas for all WebSocket messages and API requests (see [04-DATA-DESIGN.md](./04-DATA-DESIGN.md))
- [x] **Extensibility**: Registry pattern for transforms, type registry for CSS values, slice composition for store (see [01-ARCHITECTURE.md](./01-ARCHITECTURE.md#decision-5-registry-pattern-for-extensibility), [02-MODULE-DESIGN.md](./02-MODULE-DESIGN.md), [03-INTERFACES.md](./03-INTERFACES.md#32-typed-css-value-system-type-registry-pattern))

## Open Questions

- [ ] Shadow DOM styling strategy for user components
