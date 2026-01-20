# @alara/cli

Command-line interface for Alara Builder - a visual editor for React + CSS Modules.

> This CLI is under active development. Currently implements basic server startup for integration testing.

---

## Commands

### `alara dev`

Start the Alara dev server.

```bash
alara dev [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <port>` | Server port | `4000` |
| `-d, --project-directory <directory>` | Project directory | Current working directory |

**Example:**

```bash
bun run src/index.ts dev --port 4000
```

---

## Current Status

| Feature | Status |
|---------|--------|
| CLI entry point | ✅ Complete |
| `dev` command stub | ✅ Complete |
| Bun server with WebSocket | 🚧 Phase 0.3 |
| `init` command | 📋 Phase 10.1 |

---

## Development

```bash
# Run CLI in development
bun run dev

# Type check
bun run typecheck

# Build
bun run build
```
