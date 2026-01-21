import { z } from 'zod';
import { join, isAbsolute } from 'path';
import { transformRegistry, createSuccessResult, createErrorResult } from '../registry';
import { getJSXTransformer } from '../../jsx/transformer';
import type { TransformHandler, TransformContext } from '../registry';
import type { TransformResult } from '@alara/core/shared';

// ============================================================================
// Request Schema
// ============================================================================

const TextUpdateRequestSchema = z.object({
  target: z.object({
    file: z.string(),
    lineNumber: z.number().int().positive(),
    column: z.number().int().positive(),
  }),
  change: z.object({
    originalText: z.string(),
    newText: z.string(),
  }),
});

type TextUpdateRequest = z.infer<typeof TextUpdateRequestSchema>;

// ============================================================================
// Handler Implementation
// ============================================================================

const textUpdateHandler: TransformHandler<TextUpdateRequest> = {
  type: 'text-update',
  schema: TextUpdateRequestSchema,

  async execute(request: TextUpdateRequest, ctx: TransformContext): Promise<TransformResult> {
    const { target, change } = request;

    // Resolve absolute file path
    const filePath = isAbsolute(target.file)
      ? target.file
      : join(ctx.projectDir, target.file);

    console.log(`[text-update] Updating text in ${filePath}:${target.lineNumber}:${target.column}`);
    console.log(`[text-update] Original: "${change.originalText}" → New: "${change.newText}"`);

    // Get the JSX transformer
    const transformer = getJSXTransformer();

    // Perform the transformation
    const result = transformer.updateTextContent(
      filePath,
      target.lineNumber,
      target.column,
      change.originalText,
      change.newText
    );

    if (!result.success) {
      console.error(`[text-update] Failed: ${result.error}`);
      return createErrorResult(
        result.error ?? 'Unknown error',
        'ELEMENT_NOT_FOUND'
      );
    }

    console.log(`[text-update] Successfully updated ${filePath}`);

    // Create undo data for reverting this change
    const undoData = {
      type: 'text-update' as const,
      target: {
        file: target.file,
        lineNumber: target.lineNumber,
        column: target.column,
        cssFile: '',
        selectors: [],
      },
      revertChange: {
        originalText: change.newText,
        newText: change.originalText,
      },
    };

    return createSuccessResult([target.file], undoData);
  },
};

// Self-register with the registry
transformRegistry.register(textUpdateHandler);

export { textUpdateHandler };
