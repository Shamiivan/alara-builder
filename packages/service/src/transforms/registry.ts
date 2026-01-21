import { z } from 'zod';
import type { TransformResult, TransformError, ErrorCode } from '@alara/core/shared';

// ============================================================================
// Types
// ============================================================================

export interface TransformContext {
  /** Base directory of the project */
  projectDir: string;
}

export interface TransformHandler<TRequest = unknown> {
  /** Unique type identifier (e.g., 'text-update', 'css-update') */
  type: string;

  /** Zod schema for validating the request */
  schema: z.ZodType<TRequest>;

  /**
   * Execute the transform.
   * Returns a TransformResult indicating success or failure.
   */
  execute: (request: TRequest, ctx: TransformContext) => Promise<TransformResult>;
}

// ============================================================================
// Registry Implementation
// ============================================================================

class TransformRegistry {
  private handlers = new Map<string, TransformHandler>();

  /**
   * Register a transform handler.
   * Handlers self-register by importing the handler file.
   */
  register<T>(handler: TransformHandler<T>): void {
    if (this.handlers.has(handler.type)) {
      console.warn(`[TransformRegistry] Overwriting existing handler for type: ${handler.type}`);
    }
    this.handlers.set(handler.type, handler as TransformHandler);
    console.log(`[TransformRegistry] Registered handler: ${handler.type}`);
  }

  /**
   * Get a handler by type.
   */
  getHandler(type: string): TransformHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Check if a handler exists for the given type.
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Execute a transform request.
   * Validates the request and delegates to the appropriate handler.
   */
  async execute(
    type: string,
    request: unknown,
    ctx: TransformContext
  ): Promise<TransformResult> {
    const handler = this.handlers.get(type);

    if (!handler) {
      return createErrorResult(`Unknown transform type: ${type}`, 'VALIDATION_ERROR');
    }

    // Validate request against schema
    const validation = handler.schema.safeParse(request);
    if (!validation.success) {
      return createErrorResult(
        `Invalid request: ${validation.error.message}`,
        'VALIDATION_ERROR',
        { zodErrors: validation.error.flatten() }
      );
    }

    try {
      return await handler.execute(validation.data, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResult(`Transform failed: ${message}`, 'INTERNAL_ERROR');
    }
  }

  /**
   * Get all registered handler types.
   */
  getTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Singleton instance
export const transformRegistry = new TransformRegistry();

// ============================================================================
// Helper Functions
// ============================================================================

export function createErrorResult(
  message: string,
  code: ErrorCode,
  details?: Record<string, unknown>
): TransformResult {
  const error: TransformError = { code, message };
  if (details) {
    error.details = details;
  }
  return {
    success: false,
    requestId: '', // Will be set by caller
    error,
  };
}

export function createSuccessResult(
  affectedFiles: string[],
  undoData?: TransformResult['undoData']
): TransformResult {
  return {
    success: true,
    requestId: '', // Will be set by caller
    affectedFiles,
    undoData,
  };
}
