# 07 - Error Handling Strategy

This document defines the error taxonomy, recovery strategies, user feedback mechanisms, and graceful degradation patterns for Alara Builder.

---

## 1. Error Taxonomy

### 1.1 Error Categories

```typescript
enum ErrorCategory {
  // User input or action errors
  VALIDATION = 'VALIDATION',

  // File system operations
  FILE_SYSTEM = 'FILE_SYSTEM',

  // AST parsing and transformation
  TRANSFORM = 'TRANSFORM',

  // WebSocket communication
  CONNECTION = 'CONNECTION',

  // Internal system errors
  INTERNAL = 'INTERNAL',

  // Configuration errors
  CONFIG = 'CONFIG',
}
```

### 1.2 Error Severity Levels

```typescript
enum ErrorSeverity {
  // Operation failed but can retry
  WARNING = 'WARNING',

  // Feature unavailable but app continues
  ERROR = 'ERROR',

  // System cannot function
  FATAL = 'FATAL',
}
```

### 1.3 Structured Error Type

```typescript
interface AlaraError {
  code: ErrorCode;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;           // User-friendly message
  details?: string;          // Technical details for debugging
  file?: string;             // Related file path
  line?: number;             // Related line number
  recoverable: boolean;      // Whether auto-recovery is possible
  suggestedAction?: string;  // What user can do
  timestamp: number;
}
```

---

## 2. Error Codes Reference

Error codes are defined in [03-INTERFACES.md](./03-INTERFACES.md). Here's how they map to categories:

| Code | Category | Severity | Recoverable | Notes |
|------|----------|----------|-------------|-------|
| E001 | TRANSFORM | ERROR | No | User must fix selector in code |
| E002 | TRANSFORM | ERROR | No | User must fix element reference |
| E003 | TRANSFORM | ERROR | No | User must fix syntax error in code |
| E004 | FILE_SYSTEM | ERROR | No | File must exist |
| E005 | FILE_SYSTEM | FATAL | No | Permissions must be fixed |
| E006 | FILE_SYSTEM | ERROR | Yes | Auto-retry when file unlocked |
| E007 | VALIDATION | WARNING | Yes | Input can be corrected |
| E008 | VALIDATION | WARNING | Yes | Unit can be corrected |
| E009 | VALIDATION | ERROR | No | Invalid CSS selector syntax |
| E010 | FILE_SYSTEM | ERROR | No | Rename or delete variant first |
| E011 | TRANSFORM | WARNING | Yes | Unknown property - still applied |
| E012 | CONNECTION | ERROR | Yes | Auto-reconnect |
| E013 | TRANSFORM | ERROR | No | External change - refresh needed |
| E014 | VALIDATION | WARNING | Yes | Request can be corrected |
| E015 | CONFIG | ERROR | No | Config file must be fixed |
| E016 | INTERNAL | FATAL | No | Bug - report to maintainers |
| E017 | CONFIG | WARNING | Yes | Non-critical config issue |
| E018 | CONFIG | ERROR | No | Project must be configured |

---

## 3. Error Handling by Layer

### 3.1 Service Layer Error Handling

```typescript
// service/errors/AlaraError.ts
export class AlaraError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AlaraError';
  }

  toJSON(): ErrorResponse {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// Specific error factories
export const Errors = {
  selectorNotFound: (selector: string, file: string) =>
    new AlaraError('E001', `Selector "${selector}" not found`, { selector, file }),

  elementNotFound: (line: number, file: string) =>
    new AlaraError('E002', `No element at line ${line}`, { line, file }),

  parseError: (file: string, error: string) =>
    new AlaraError('E003', `Failed to parse ${file}`, { file, error }),

  fileNotFound: (file: string) =>
    new AlaraError('E004', `File not found: ${file}`, { file }),

  writePermissionDenied: (file: string) =>
    new AlaraError('E005', `Cannot write to ${file}`, { file }),

  variantExists: (name: string) =>
    new AlaraError('E010', `Variant "${name}" already exists`, { name }),

  invalidValue: (property: string, value: string, reason: string) =>
    new AlaraError('E007', `Invalid ${property} value`, { property, value, reason }),
};
```

### 3.2 Transform Engine Error Handling (Registry Pattern)

The TransformEngine delegates to the Transform Registry, which handles validation and execution.

```typescript
// service/engine/TransformEngine.ts
import { transformRegistry } from '@alara/core/transforms';

export class TransformEngine {
  async transform(request: TransformRequest): Promise<TransformResult> {
    const transaction = new Transaction();
    const ctx: TransformContext = {
      projectDir: this.projectDir,
      cache: this.cache,
      transaction,
    };

    try {
      // Registry handles:
      // 1. Looking up handler by request.type
      // 2. Validating request with handler's Zod schema
      // 3. Executing handler
      await transformRegistry.execute(request, ctx);

      await transaction.commit();
      return { success: true, requestId: request.id };

    } catch (error) {
      // Rollback on any error
      await transaction.rollback();

      // Convert to AlaraError if needed
      const alaraError = error instanceof AlaraError
        ? error
        : new AlaraError('E016', 'Internal error', { original: error.message });

      // Log for debugging
      this.logger.error('Transform failed', {
        requestId: request.id,
        error: alaraError.toJSON(),
      });

      return {
        success: false,
        requestId: request.id,
        error: alaraError.toJSON(),
      };
    }
  }
}
```

### 3.3 Handler-Level Error Handling

Each handler can throw specific errors that are caught by the engine.

```typescript
// core/src/transforms/handlers/css-update.ts
const cssUpdateHandler: TransformHandler<CSSUpdateRequest> = {
  type: 'css-update',
  schema: CSSUpdateRequestSchema,

  async execute(request, ctx) {
    const { target, change } = request;

    // Get AST from cache (or parse if not cached)
    let root = ctx.cssCache.get(target.cssFile);
    if (!root) {
      // CSS file not in cache - try to parse it
      try {
        const content = await Bun.file(target.cssFile).text();
        root = postcss.parse(content, { from: target.cssFile });
        await ctx.cssCache.set(target.cssFile, root);
      } catch {
        throw new AlaraError('E001', 'File not found', { file: target.cssFile });
      }
    }

    // Find selector
    const rule = findRule(root, target.selector);
    if (!rule) {
      throw new AlaraError('E003', 'Selector not found', {
        file: target.cssFile,
        selector: target.selector,
      });
    }

    // Update property...
  },
};
```

### 3.4 WebSocket Error Handling

```typescript
// service/ws/handler.ts
export function createWebSocketHandler(engine: TransformEngine) {
  return {
    async message(ws: ServerWebSocket, message: string) {
      let requestId: string | undefined;

      try {
        // Parse message
        const data = JSON.parse(message);
        requestId = data.id;

        // Validate with Zod
        const validated = WSClientMessageSchema.safeParse(data);
        if (!validated.success) {
          throw new AlaraError('E014', 'Invalid message format', {
            errors: validated.error.issues,
          });
        }

        // Process request
        const result = await engine.transform(validated.data);
        ws.send(JSON.stringify(result));

      } catch (error) {
        const response: ErrorResponse = {
          type: 'error',
          requestId,
          code: error instanceof AlaraError ? error.code : 'E016',
          message: error instanceof AlaraError ? error.message : 'Internal error',
        };

        ws.send(JSON.stringify(response));
      }
    },
  };
}
```

### 3.4 Builder UI Error Handling

```typescript
// builder/hooks/useErrorHandler.ts
export function useErrorHandler() {
  const [errors, setErrors] = useState<AlaraError[]>([]);

  const handleError = useCallback((error: AlaraError) => {
    // Add to error list
    setErrors(prev => [...prev, error]);

    // Show toast notification
    showToast({
      type: getSeverityType(error.severity),
      title: getErrorTitle(error.code),
      message: error.message,
      action: error.suggestedAction ? {
        label: 'Fix',
        onClick: () => handleSuggestedAction(error),
      } : undefined,
    });

    // Log for debugging
    console.error('[Alara]', error);

    // Auto-dismiss warnings after 5 seconds
    if (error.severity === 'WARNING') {
      setTimeout(() => {
        setErrors(prev => prev.filter(e => e !== error));
      }, 5000);
    }
  }, []);

  return { errors, handleError, clearErrors: () => setErrors([]) };
}

function getSeverityType(severity: ErrorSeverity): ToastType {
  switch (severity) {
    case 'WARNING': return 'warning';
    case 'ERROR': return 'error';
    case 'FATAL': return 'error';
  }
}

function getErrorTitle(code: ErrorCode): string {
  const titles: Record<ErrorCode, string> = {
    E001: 'Selector Not Found',
    E002: 'Element Not Found',
    E003: 'Parse Error',
    E004: 'File Not Found',
    E005: 'Permission Denied',
    E006: 'File Locked',
    E007: 'Invalid Value',
    E008: 'Invalid Unit',
    E009: 'Invalid Selector',
    E010: 'Variant Exists',
    E011: 'Unknown Property',
    E012: 'Connection Lost',
    E013: 'Transform Conflict',
    E014: 'Invalid Request',
    E015: 'Config Error',
    E016: 'Internal Error',
    E017: 'Plugin Warning',
    E018: 'Project Mismatch',
  };
  return titles[code] || 'Error';
}
```

---

## 4. Recovery Strategies

### 4.1 Automatic Recovery

```typescript
// builder/store/recoverySlice.ts
interface RecoveryState {
  retryQueue: FailedRequest[];
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

const recoverySlice = {
  // Retry failed transforms with exponential backoff
  async retryFailedRequest(request: FailedRequest): Promise<boolean> {
    const { id, payload, attempts } = request;
    const maxAttempts = 3;

    if (attempts >= maxAttempts) {
      // Give up, notify user
      showToast({
        type: 'error',
        message: `Failed after ${maxAttempts} attempts`,
        action: { label: 'Retry', onClick: () => this.retryFailedRequest(request) },
      });
      return false;
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, attempts) * 1000;
    await sleep(delay);

    try {
      const result = await sendTransform(payload);
      if (result.success) {
        this.removeFromRetryQueue(id);
        return true;
      }
    } catch {
      // Network error, will retry
    }

    // Increment attempts and reschedule
    this.updateRetryAttempts(id, attempts + 1);
    return this.retryFailedRequest({ ...request, attempts: attempts + 1 });
  },

  // WebSocket reconnection with backoff
  async attemptReconnect(): Promise<void> {
    const { reconnectAttempts, maxReconnectAttempts } = get();

    if (reconnectAttempts >= maxReconnectAttempts) {
      set({ wsConnected: false });
      showToast({
        type: 'error',
        message: 'Connection lost. Please refresh the page.',
      });
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    await sleep(delay);

    try {
      await this.connect();
      set({ reconnectAttempts: 0 });
    } catch {
      set({ reconnectAttempts: reconnectAttempts + 1 });
      this.attemptReconnect();
    }
  },
};
```

### 4.2 User-Initiated Recovery

```typescript
// Recovery actions available to users
interface RecoveryActions {
  // Retry last failed operation
  retryLast(): void;

  // Reload file from disk (discard pending changes)
  reloadFile(path: string): Promise<void>;

  // Reset editor state
  resetEditor(): void;

  // Force reconnect
  forceReconnect(): void;
}

const recoveryActions: RecoveryActions = {
  retryLast() {
    const lastFailed = get().retryQueue[0];
    if (lastFailed) {
      retryFailedRequest(lastFailed);
    }
  },

  async reloadFile(path: string) {
    // Clear pending edits for this file
    const pending = get().pendingEdits;
    for (const [id, edit] of pending) {
      if (edit.target.file === path) {
        pending.delete(id);
      }
    }

    // Invalidate cache
    wsClient.send(JSON.stringify({
      action: 'invalidate-cache',
      file: path,
    }));

    // Force HMR reload
    if (import.meta.hot) {
      import.meta.hot.invalidate();
    }
  },

  resetEditor() {
    set({
      selectedElement: null,
      hoveredElement: null,
      pendingEdits: new Map(),
      undoStack: [],
      redoStack: [],
    });
  },

  forceReconnect() {
    get().wsClient?.close();
    set({ reconnectAttempts: 0 });
    get().connect(WS_URL);
  },
};
```

### 4.3 Rollback Strategies

```typescript
// Rollback levels
enum RollbackLevel {
  PROPERTY = 'PROPERTY',  // Single property change
  ELEMENT = 'ELEMENT',    // All changes to one element
  FILE = 'FILE',          // All changes to one file
  SESSION = 'SESSION',    // All changes this session
}

async function rollback(level: RollbackLevel, target?: string): Promise<void> {
  const { undoStack } = get();

  switch (level) {
    case RollbackLevel.PROPERTY:
      // Just undo last
      get().undo();
      break;

    case RollbackLevel.ELEMENT:
      // Undo all for specific element
      const elementCommands = undoStack.filter(
        cmd => `${cmd.target.file}:${cmd.target.lineNumber}` === target
      );
      for (const cmd of elementCommands.reverse()) {
        await executeUndo(cmd);
      }
      break;

    case RollbackLevel.FILE:
      // Undo all for file
      const fileCommands = undoStack.filter(cmd => cmd.target.file === target);
      for (const cmd of fileCommands.reverse()) {
        await executeUndo(cmd);
      }
      break;

    case RollbackLevel.SESSION:
      // Undo everything
      while (undoStack.length > 0) {
        get().undo();
      }
      break;
  }
}
```

---

## 5. User Feedback Mechanisms

### 5.1 Toast Notifications

```typescript
// builder/components/Toast/Toast.tsx
interface ToastConfig {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title?: string;
  message: string;
  duration?: number;  // ms, 0 = permanent
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Toast display rules
const TOAST_RULES = {
  // Success toasts auto-dismiss
  success: { duration: 3000, position: 'bottom-right' },

  // Warnings stay longer
  warning: { duration: 5000, position: 'bottom-right' },

  // Errors require dismissal
  error: { duration: 0, position: 'top-right' },

  // Info is brief
  info: { duration: 2000, position: 'bottom-right' },
};
```

### 5.2 Inline Error States

```typescript
// builder/components/FloatingToolbox/controls/PropertyInput.tsx
interface PropertyInputProps {
  property: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function PropertyInput({ property, value, onChange, error }: PropertyInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);

    // Validate before sending
    const validation = validateCSSValue(property, newValue);
    if (!validation.valid) {
      setValidationError(validation.error);
      return;
    }

    setValidationError(null);
    onChange(newValue);
  };

  return (
    <div className={styles.inputWrapper}>
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        className={clsx(styles.input, {
          [styles.inputError]: error || validationError,
        })}
      />
      {(error || validationError) && (
        <span className={styles.errorText}>
          {error || validationError}
        </span>
      )}
    </div>
  );
}
```

### 5.3 Status Indicators

```typescript
// builder/components/StatusBar/StatusBar.tsx
export function StatusBar() {
  const { wsConnected, pendingEdits } = useEditorStore();
  const pendingCount = pendingEdits.size;

  return (
    <div className={styles.statusBar}>
      {/* Connection status */}
      <div className={styles.connectionStatus}>
        <span className={clsx(styles.dot, {
          [styles.connected]: wsConnected,
          [styles.disconnected]: !wsConnected,
        })} />
        {wsConnected ? 'Connected' : 'Disconnected'}
      </div>

      {/* Pending edits */}
      {pendingCount > 0 && (
        <div className={styles.pendingStatus}>
          <Spinner size="small" />
          {pendingCount} pending...
        </div>
      )}

      {/* Last error */}
      <ErrorBadge />
    </div>
  );
}
```

### 5.4 Error Details Modal

```typescript
// builder/components/ErrorDetails/ErrorDetails.tsx
export function ErrorDetailsModal({ error, onClose }: { error: AlaraError; onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className={styles.errorDetails}>
        <header className={styles.header}>
          <ErrorIcon severity={error.severity} />
          <h2>{getErrorTitle(error.code)}</h2>
          <code className={styles.code}>{error.code}</code>
        </header>

        <section className={styles.message}>
          <p>{error.message}</p>
        </section>

        {error.file && (
          <section className={styles.location}>
            <strong>Location:</strong>
            <code>{error.file}{error.line ? `:${error.line}` : ''}</code>
          </section>
        )}

        {error.details && (
          <section className={styles.technical}>
            <strong>Technical Details:</strong>
            <pre>{error.details}</pre>
          </section>
        )}

        {error.suggestedAction && (
          <section className={styles.action}>
            <strong>Suggested Action:</strong>
            <p>{error.suggestedAction}</p>
          </section>
        )}

        <footer className={styles.footer}>
          <Button onClick={onClose}>Dismiss</Button>
          <Button variant="secondary" onClick={() => copyToClipboard(JSON.stringify(error, null, 2))}>
            Copy Details
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
```

---

## 6. Graceful Degradation

### 6.1 Feature Degradation Matrix

| Feature | Fallback When Unavailable |
|---------|---------------------------|
| WebSocket | Show "offline" mode, queue edits for later |
| CSS parsing | Show raw CSS in textarea fallback |
| JSX parsing | Disable text editing, show warning |
| File watching | Manual refresh button |
| Undo/redo | Disable buttons, show "unavailable" |
| Variant creation | Hide variant panel section |
| Properties panel | Show message "Cannot read styles" |

### 6.2 Offline Mode

```typescript
// builder/store/offlineSlice.ts
interface OfflineState {
  isOffline: boolean;
  queuedOperations: QueuedOperation[];
}

const offlineSlice = {
  setOffline(isOffline: boolean) {
    set({ isOffline });

    if (isOffline) {
      showToast({
        type: 'warning',
        title: 'Offline Mode',
        message: 'Changes will be saved when connection is restored.',
        duration: 0,
      });
    }
  },

  queueOperation(operation: QueuedOperation) {
    if (!get().isOffline) {
      // Online - send immediately
      sendOperation(operation);
      return;
    }

    // Offline - queue for later
    set(state => ({
      queuedOperations: [...state.queuedOperations, operation],
    }));
  },

  async flushQueue() {
    const { queuedOperations } = get();
    set({ queuedOperations: [] });

    for (const op of queuedOperations) {
      try {
        await sendOperation(op);
      } catch {
        // Re-queue failed operations
        set(state => ({
          queuedOperations: [...state.queuedOperations, op],
        }));
      }
    }
  },
};
```

### 6.3 Read-Only Fallback

```typescript
// builder/components/FloatingToolbox/FloatingToolbox.tsx
export function FloatingToolbox({ element, referenceElement }: FloatingToolboxProps) {
  const { canEdit } = usePermissions();

  if (!canEdit) {
    return (
      <div className={styles.toolbox}>
        <div className={styles.readOnlyBanner}>
          <InfoIcon />
          <span>Read-only mode. Cannot modify files.</span>
        </div>
        <ReadOnlyStyles element={element} />
      </div>
    );
  }

  // Normal editable toolbox...
}
```

---

## 7. Logging and Monitoring

### 7.1 Structured Logging

```typescript
// service/logging/logger.ts
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  context?: {
    requestId?: string;
    file?: string;
    clientId?: string;
  };
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private entries: LogEntry[] = [];
  private maxEntries = 1000;

  log(level: LogEntry['level'], message: string, context?: LogEntry['context'], error?: Error) {
    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context,
      error: error ? {
        code: error instanceof AlaraError ? error.code : 'E016',
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Also output to console in dev
    if (process.env.NODE_ENV === 'development') {
      console[level](message, context, error);
    }
  }

  getRecent(count = 100): LogEntry[] {
    return this.entries.slice(-count);
  }

  exportForDebugging(): string {
    return JSON.stringify(this.entries, null, 2);
  }
}

export const logger = new Logger();
```

### 7.2 Error Aggregation

```typescript
// service/monitoring/errorAggregator.ts
interface AggregatedError {
  code: ErrorCode;
  count: number;
  lastSeen: number;
  samples: Array<{
    timestamp: number;
    file?: string;
    details?: string;
  }>;
}

class ErrorAggregator {
  private errors: Map<ErrorCode, AggregatedError> = new Map();

  record(error: AlaraError) {
    const existing = this.errors.get(error.code);

    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
      existing.samples.push({
        timestamp: Date.now(),
        file: error.file,
        details: error.details,
      });
      // Keep only last 10 samples
      if (existing.samples.length > 10) {
        existing.samples.shift();
      }
    } else {
      this.errors.set(error.code, {
        code: error.code,
        count: 1,
        lastSeen: Date.now(),
        samples: [{
          timestamp: Date.now(),
          file: error.file,
          details: error.details,
        }],
      });
    }
  }

  getReport(): AggregatedError[] {
    return Array.from(this.errors.values())
      .sort((a, b) => b.count - a.count);
  }
}
```

### 7.3 Debug Panel

```typescript
// builder/components/DebugPanel/DebugPanel.tsx
export function DebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogEntry['level'] | 'all'>('all');

  useEffect(() => {
    // Poll for logs
    const interval = setInterval(() => {
      fetch('/api/logs/recent')
        .then(r => r.json())
        .then(setLogs);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(l => l.level === filter);

  return (
    <div className={styles.debugPanel}>
      <header>
        <h3>Debug Logs</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
          <option value="all">All</option>
          <option value="error">Errors</option>
          <option value="warn">Warnings</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
      </header>

      <div className={styles.logList}>
        {filteredLogs.map((log, i) => (
          <LogEntry key={i} log={log} />
        ))}
      </div>

      <footer>
        <Button onClick={() => downloadLogs()}>Export Logs</Button>
      </footer>
    </div>
  );
}
```

---

## 8. Error Prevention

### 8.1 Input Validation

```typescript
// Validate CSS values before sending to server
const CSS_VALUE_VALIDATORS: Record<string, (value: string) => ValidationResult> = {
  'padding': validateSpacingValue,
  'margin': validateSpacingValue,
  'width': validateDimensionValue,
  'height': validateDimensionValue,
  'color': validateColorValue,
  'background-color': validateColorValue,
  'font-size': validateFontSizeValue,
  // ... etc
};

function validateSpacingValue(value: string): ValidationResult {
  // Allow: 10px, 1rem, 0, auto
  const pattern = /^(\d+(\.\d+)?(px|rem|em|%|vh|vw)|0|auto)$/;
  if (!pattern.test(value.trim())) {
    return {
      valid: false,
      error: 'Must be a valid length (e.g., 10px, 1rem) or "auto"',
    };
  }
  return { valid: true };
}

function validateColorValue(value: string): ValidationResult {
  // Allow: #hex, rgb(), rgba(), hsl(), hsla(), named colors
  const hexPattern = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+)?\s*\)$/;
  const namedColors = ['red', 'blue', 'green', 'transparent', /* etc */];

  if (hexPattern.test(value) || rgbPattern.test(value) || namedColors.includes(value.toLowerCase())) {
    return { valid: true };
  }
  return { valid: false, error: 'Must be a valid color (hex, rgb, or named)' };
}
```

### 8.2 Confirmation for Destructive Actions

```typescript
// builder/hooks/useConfirmation.ts
export function useConfirmation() {
  const confirm = useCallback(async (config: ConfirmConfig): Promise<boolean> => {
    return new Promise((resolve) => {
      showModal({
        title: config.title,
        message: config.message,
        variant: config.destructive ? 'danger' : 'default',
        actions: [
          {
            label: 'Cancel',
            onClick: () => resolve(false),
          },
          {
            label: config.confirmLabel || 'Confirm',
            variant: config.destructive ? 'danger' : 'primary',
            onClick: () => resolve(true),
          },
        ],
      });
    });
  }, []);

  return { confirm };
}

// Usage
const { confirm } = useConfirmation();

async function deleteVariant(name: string) {
  const confirmed = await confirm({
    title: 'Delete Variant',
    message: `Are you sure you want to delete "${name}"? This will remove the CSS class and update all JSX references.`,
    destructive: true,
    confirmLabel: 'Delete',
  });

  if (confirmed) {
    // Proceed with deletion
  }
}
```

---

## 9. Error Handling Decision Tree

```
Error Occurred
     │
     ├─► Is it a validation error (E007, E008, E009, E014)?
     │   ├─► YES: Show inline error, don't send to server
     │   └─► NO: Continue
     │
     ├─► Is it a connection error (E012)?
     │   ├─► YES: Queue operation, attempt reconnect
     │   └─► NO: Continue
     │
     ├─► Is it a file error (E004, E005, E006)?
     │   ├─► YES: Show toast, suggest manual action
     │   └─► NO: Continue
     │
     ├─► Is it a transform error (E001, E002, E003, E013)?
     │   ├─► YES: Remove from pending edits, show error with context
     │   └─► NO: Continue
     │
     ├─► Is it a config error (E015, E017, E018)?
     │   ├─► YES: Show persistent warning, link to docs
     │   └─► NO: Continue
     │
     └─► It's an internal error (E016)
         └─► Log full details, show generic error, offer bug report
```

---

## 10. Testing Error Handling

See [09-TESTING.md](./09-TESTING.md) for comprehensive error handling test cases.

Key test scenarios:
1. All error codes trigger appropriate UI feedback
2. Recovery actions work correctly
3. Offline mode queues and flushes correctly
4. Rollback restores correct state
5. Validation prevents invalid inputs from reaching server
