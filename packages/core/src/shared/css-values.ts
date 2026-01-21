import { z } from 'zod';

// ============================================================================
// CSS Units (8 supported units)
// ============================================================================

export const CSSUnits = ['px', 'rem', 'em', '%', 'vh', 'vw', 'vmin', 'vmax'] as const;
export type CSSUnit = (typeof CSSUnits)[number];

export const CSSUnitSchema = z.enum(CSSUnits);

// ============================================================================
// Color Spaces
// ============================================================================

export const ColorSpaces = ['srgb', 'hsl', 'oklch', 'oklab', 'display-p3'] as const;
export type ColorSpace = (typeof ColorSpaces)[number];

export const ColorSpaceSchema = z.enum(ColorSpaces);

// ============================================================================
// StyleValue Types (7 core types)
// ============================================================================

/**
 * UnitValue - CSS dimension with unit
 * Examples: 16px, 1.5rem, 100%
 */
export const UnitValueSchema = z.object({
  type: z.literal('unit'),
  value: z.number(),
  unit: CSSUnitSchema,
});
export type UnitValue = z.infer<typeof UnitValueSchema>;

/**
 * NumberValue - Unitless number
 * Examples: 0, 1.5, 400 (for font-weight)
 */
export const NumberValueSchema = z.object({
  type: z.literal('number'),
  value: z.number(),
});
export type NumberValue = z.infer<typeof NumberValueSchema>;

/**
 * KeywordValue - CSS keyword identifier
 * Examples: auto, inherit, flex-start, solid
 */
export const KeywordValueSchema = z.object({
  type: z.literal('keyword'),
  value: z.string(),
});
export type KeywordValue = z.infer<typeof KeywordValueSchema>;

/**
 * ColorValue - Structured color representation
 * Examples: #ff0000, rgb(255, 0, 0), oklch(0.7 0.15 30)
 */
export const ColorValueSchema = z.object({
  type: z.literal('color'),
  colorSpace: ColorSpaceSchema,
  channels: z.tuple([z.number(), z.number(), z.number()]),
  alpha: z.number().min(0).max(1),
});
export type ColorValue = z.infer<typeof ColorValueSchema>;

/**
 * VarValue - CSS custom property reference
 * Examples: var(--color-primary), var(--spacing, 16px)
 */
export const VarValueSchema: z.ZodType<VarValue> = z.object({
  type: z.literal('var'),
  name: z.string(),
  fallback: z.lazy(() => StyleValueSchema).optional(),
});
export type VarValue = {
  type: 'var';
  name: string;
  fallback?: StyleValue;
};

/**
 * TupleValue - Multiple values (e.g., shorthand properties)
 * Examples: 10px 20px (margin), 1px solid red (border)
 */
export const TupleValueSchema: z.ZodType<TupleValue> = z.object({
  type: z.literal('tuple'),
  values: z.lazy(() => z.array(StyleValueSchema)),
});
export type TupleValue = {
  type: 'tuple';
  values: StyleValue[];
};

/**
 * UnparsedValue - Fallback for complex/unsupported values
 * Examples: calc(100% - 20px), linear-gradient(...), box-shadow values
 */
export const UnparsedValueSchema = z.object({
  type: z.literal('unparsed'),
  value: z.string(),
});
export type UnparsedValue = z.infer<typeof UnparsedValueSchema>;

// ============================================================================
// StyleValue Union
// ============================================================================

export const StyleValueSchema: z.ZodType<StyleValue> = z.discriminatedUnion('type', [
  UnitValueSchema,
  NumberValueSchema,
  KeywordValueSchema,
  ColorValueSchema,
  z.object({
    type: z.literal('var'),
    name: z.string(),
    fallback: z.lazy(() => StyleValueSchema).optional(),
  }),
  z.object({
    type: z.literal('tuple'),
    values: z.lazy(() => z.array(StyleValueSchema)),
  }),
  UnparsedValueSchema,
]);

export type StyleValue =
  | UnitValue
  | NumberValue
  | KeywordValue
  | ColorValue
  | VarValue
  | TupleValue
  | UnparsedValue;

// ============================================================================
// Type Guards
// ============================================================================

export function isUnitValue(value: StyleValue): value is UnitValue {
  return value.type === 'unit';
}

export function isNumberValue(value: StyleValue): value is NumberValue {
  return value.type === 'number';
}

export function isKeywordValue(value: StyleValue): value is KeywordValue {
  return value.type === 'keyword';
}

export function isColorValue(value: StyleValue): value is ColorValue {
  return value.type === 'color';
}

export function isVarValue(value: StyleValue): value is VarValue {
  return value.type === 'var';
}

export function isTupleValue(value: StyleValue): value is TupleValue {
  return value.type === 'tuple';
}

export function isUnparsedValue(value: StyleValue): value is UnparsedValue {
  return value.type === 'unparsed';
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createUnitValue(value: number, unit: CSSUnit): UnitValue {
  return { type: 'unit', value, unit };
}

export function createNumberValue(value: number): NumberValue {
  return { type: 'number', value };
}

export function createKeywordValue(value: string): KeywordValue {
  return { type: 'keyword', value };
}

export function createColorValue(
  colorSpace: ColorSpace,
  channels: [number, number, number],
  alpha: number = 1
): ColorValue {
  return { type: 'color', colorSpace, channels, alpha };
}

export function createVarValue(name: string, fallback?: StyleValue): VarValue {
  return fallback ? { type: 'var', name, fallback } : { type: 'var', name };
}

export function createTupleValue(values: StyleValue[]): TupleValue {
  return { type: 'tuple', values };
}

export function createUnparsedValue(value: string): UnparsedValue {
  return { type: 'unparsed', value };
}
