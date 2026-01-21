import { z } from 'zod';
import { StyleValueSchema, type StyleValue } from './css-values.js';
import { ElementTargetSchema, type ElementTarget } from './elements.js';

// ============================================================================
// Transform Types
// ============================================================================

export const TransformTypes = [
  'css-update',
  'css-add',
  'css-remove',
  'text-update',
] as const;

export type TransformType = (typeof TransformTypes)[number];

export const TransformTypeSchema = z.enum(TransformTypes);

// ============================================================================
// Change Types
// ============================================================================

/**
 * CSSUpdateChange - Update an existing CSS property value
 */
export const CSSUpdateChangeSchema = z.object({
  property: z.string(),
  computedValue: StyleValueSchema,
  newValue: StyleValueSchema,
});
export type CSSUpdateChange = z.infer<typeof CSSUpdateChangeSchema>;

/**
 * CSSAddChange - Add a new CSS property
 */
export const CSSAddChangeSchema = z.object({
  property: z.string(),
  computedValue: StyleValueSchema.nullable(),
  newValue: StyleValueSchema,
});
export type CSSAddChange = z.infer<typeof CSSAddChangeSchema>;

/**
 * CSSRemoveChange - Remove a CSS property
 */
export const CSSRemoveChangeSchema = z.object({
  property: z.string(),
  computedValue: StyleValueSchema,
});
export type CSSRemoveChange = z.infer<typeof CSSRemoveChangeSchema>;

/**
 * TextUpdateChange - Update JSX text content
 */
export const TextUpdateChangeSchema = z.object({
  originalText: z.string(),
  newText: z.string(),
});
export type TextUpdateChange = z.infer<typeof TextUpdateChangeSchema>;

/**
 * Union of all change types
 */
export const TransformChangeSchema = z.union([
  CSSUpdateChangeSchema,
  CSSAddChangeSchema,
  CSSRemoveChangeSchema,
  TextUpdateChangeSchema,
]);
export type TransformChange = z.infer<typeof TransformChangeSchema>;

// ============================================================================
// Transform Request
// ============================================================================

/**
 * TransformRequest - Request to transform code
 */
export const TransformRequestSchema = z.object({
  id: z.string(),
  type: TransformTypeSchema,
  target: ElementTargetSchema,
  change: TransformChangeSchema,
});
export type TransformRequest = z.infer<typeof TransformRequestSchema>;

// ============================================================================
// Transform Result
// ============================================================================

/**
 * Error codes for transform operations
 */
export const ErrorCodes = [
  'SELECTOR_NOT_FOUND',
  'FILE_NOT_FOUND',
  'PARSE_ERROR',
  'VALIDATION_ERROR',
  'WRITE_ERROR',
  'ELEMENT_NOT_FOUND',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ErrorCodes)[number];

export const ErrorCodeSchema = z.enum(ErrorCodes);

/**
 * TransformError - Error details for failed transforms
 */
export const TransformErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type TransformError = z.infer<typeof TransformErrorSchema>;

/**
 * UndoData - Information needed to revert a transform
 */
export const UndoDataSchema = z.object({
  type: TransformTypeSchema,
  target: ElementTargetSchema,
  revertChange: TransformChangeSchema,
});
export type UndoData = z.infer<typeof UndoDataSchema>;

/**
 * TransformResult - Result of a transform operation
 */
export const TransformResultSchema = z.object({
  success: z.boolean(),
  requestId: z.string(),
  affectedFiles: z.array(z.string()).optional(),
  error: TransformErrorSchema.optional(),
  undoData: UndoDataSchema.optional(),
});
export type TransformResult = z.infer<typeof TransformResultSchema>;

// ============================================================================
// Type Guards for Change Types
// ============================================================================

export function isCSSUpdateChange(change: TransformChange): change is CSSUpdateChange {
  return 'property' in change && 'computedValue' in change && 'newValue' in change;
}

export function isCSSAddChange(change: TransformChange): change is CSSAddChange {
  return (
    'property' in change &&
    'computedValue' in change &&
    'newValue' in change &&
    (change as CSSAddChange).computedValue === null
  );
}

export function isCSSRemoveChange(change: TransformChange): change is CSSRemoveChange {
  return 'property' in change && 'computedValue' in change && !('newValue' in change);
}

export function isTextUpdateChange(change: TransformChange): change is TextUpdateChange {
  return 'originalText' in change && 'newText' in change;
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createCSSUpdateChange(
  property: string,
  computedValue: StyleValue,
  newValue: StyleValue
): CSSUpdateChange {
  return { property, computedValue, newValue };
}

export function createCSSAddChange(
  property: string,
  newValue: StyleValue,
  computedValue: StyleValue | null = null
): CSSAddChange {
  return { property, computedValue, newValue };
}

export function createCSSRemoveChange(property: string, computedValue: StyleValue): CSSRemoveChange {
  return { property, computedValue };
}

export function createTextUpdateChange(originalText: string, newText: string): TextUpdateChange {
  return { originalText, newText };
}

export function createTransformRequest(
  id: string,
  type: TransformType,
  target: ElementTarget,
  change: TransformChange
): TransformRequest {
  return { id, type, target, change };
}

export function createTransformResult(
  requestId: string,
  success: boolean,
  options?: {
    affectedFiles?: string[];
    error?: TransformError;
    undoData?: UndoData;
  }
): TransformResult {
  return {
    success,
    requestId,
    ...options,
  };
}

export function createTransformError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): TransformError {
  return details ? { code, message, details } : { code, message };
}
