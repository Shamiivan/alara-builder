# @alara/buildtime

Build-time tools for Alara Builder - Vite plugin and Babel transforms for React + CSS Modules.

> This package is under active development. Currently implements basic Vite plugin with client script injection.

---

## Usage

Add the plugin to your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { alaraPlugin } from '@alara/buildtime';

export default defineConfig({
  plugins: [react(), alaraPlugin()],
});
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `serverPort` | Alara dev server port | `4000` |

```typescript
alaraPlugin({ serverPort: 4000 })
```

---

## Structure

```
src/
├── index.ts          # Public exports
└── vite-plugin.ts    # Vite plugin entry point
```

---

## Current Status

| Feature | Status |
|---------|--------|
| Vite plugin shell | ✅ Complete |
| Client script injection | ✅ Complete |
| WebSocket connection | ✅ Complete |
| Babel plugin (oid/css attributes) | 📋 Phase 2.4 |

---

## Development

```bash
# Type check
bun run typecheck
```
