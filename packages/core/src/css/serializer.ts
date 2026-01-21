import type { StyleValue } from '../shared/css-values.js';
import { colorToString } from './color-parser.js';

// ============================================================================
// CSS Value Serializer
// ============================================================================

/**
 * Convert a StyleValue to a CSS string.
 *
 * This is the inverse of parseCssValue - it takes a structured StyleValue
 * and produces a valid CSS value string.
 *
 * @param value - StyleValue to serialize
 * @returns CSS value string
 */
export function toValue(value: StyleValue): string {
  switch (value.type) {
    case 'unit':
      return `${formatNumber(value.value)}${value.unit}`;

    case 'number':
      return formatNumber(value.value);

    case 'keyword':
      return value.value;

    case 'color':
      return colorToString(value);

    case 'var': {
      if (value.fallback) {
        return `var(${value.name}, ${toValue(value.fallback)})`;
      }
      return `var(${value.name})`;
    }

    case 'tuple':
      return value.values.map(toValue).join(' ');

    case 'unparsed':
      return value.value;

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = value;
      return String(_exhaustive);
    }
  }
}

/**
 * Format a number for CSS output.
 *
 * - Removes unnecessary trailing zeros
 * - Limits decimal places for readability
 * - Handles special values like 0
 *
 * @param num - Number to format
 * @param maxDecimals - Maximum decimal places (default: 4)
 * @returns Formatted number string
 */
export function formatNumber(num: number, maxDecimals: number = 4): string {
  // Handle special cases
  if (num === 0) return '0';
  if (!Number.isFinite(num)) return String(num);

  // Round to max decimals
  const factor = Math.pow(10, maxDecimals);
  const rounded = Math.round(num * factor) / factor;

  // Convert to string and remove trailing zeros
  let str = rounded.toString();

  // If it has a decimal point, remove trailing zeros
  if (str.includes('.')) {
    str = str.replace(/\.?0+$/, '');
  }

  return str;
}

/**
 * Serialize a StyleValue with specific formatting options.
 */
export interface SerializeOptions {
  /**
   * Maximum decimal places for numbers
   * @default 4
   */
  maxDecimals?: number;

  /**
   * Color output format
   * @default undefined (use color's native format)
   */
  colorFormat?: 'hex' | 'rgb' | 'hsl' | 'oklch' | 'oklab';

  /**
   * Whether to use shorthand for tuples where possible
   * @default false
   */
  useShorthand?: boolean;
}

/**
 * Serialize a StyleValue with custom options.
 *
 * @param value - StyleValue to serialize
 * @param options - Serialization options
 * @returns CSS value string
 */
export function serializeStyleValue(value: StyleValue, options: SerializeOptions = {}): string {
  const { maxDecimals = 4, colorFormat, useShorthand = false } = options;

  switch (value.type) {
    case 'unit':
      return `${formatNumber(value.value, maxDecimals)}${value.unit}`;

    case 'number':
      return formatNumber(value.value, maxDecimals);

    case 'keyword':
      return value.value;

    case 'color':
      return colorToString(value, colorFormat);

    case 'var': {
      if (value.fallback) {
        return `var(${value.name}, ${serializeStyleValue(value.fallback, options)})`;
      }
      return `var(${value.name})`;
    }

    case 'tuple': {
      const serialized = value.values.map((v) => serializeStyleValue(v, options));

      // Try to collapse identical values (e.g., "10px 10px 10px 10px" -> "10px")
      if (useShorthand) {
        const collapsed = collapseTupleValues(serialized);
        if (collapsed) return collapsed;
      }

      return serialized.join(' ');
    }

    case 'unparsed':
      return value.value;

    default: {
      const _exhaustive: never = value;
      return String(_exhaustive);
    }
  }
}

/**
 * Try to collapse a tuple of values into shorthand notation.
 *
 * For example:
 * - ["10px", "10px", "10px", "10px"] -> "10px"
 * - ["10px", "20px", "10px", "20px"] -> "10px 20px"
 * - ["10px", "20px", "30px", "20px"] -> "10px 20px 30px"
 *
 * @param values - Array of serialized values
 * @returns Collapsed string or null if cannot collapse
 */
function collapseTupleValues(values: string[]): string | null {
  if (values.length !== 4) return null;

  const [top, right, bottom, left] = values;

  // All same
  if (top === right && right === bottom && bottom === left) {
    return top;
  }

  // Top/bottom and left/right pairs
  if (top === bottom && right === left) {
    return `${top} ${right}`;
  }

  // Top, left/right pair, bottom
  if (right === left) {
    return `${top} ${right} ${bottom}`;
  }

  return null;
}

/**
 * Check if two StyleValues are equal.
 *
 * @param a - First StyleValue
 * @param b - Second StyleValue
 * @returns true if values are structurally equal
 */
export function styleValuesEqual(a: StyleValue, b: StyleValue): boolean {
  if (a.type !== b.type) return false;

  switch (a.type) {
    case 'unit':
      return a.value === (b as typeof a).value && a.unit === (b as typeof a).unit;

    case 'number':
      return a.value === (b as typeof a).value;

    case 'keyword':
      return a.value === (b as typeof a).value;

    case 'color': {
      const bc = b as typeof a;
      return (
        a.colorSpace === bc.colorSpace &&
        a.alpha === bc.alpha &&
        a.channels[0] === bc.channels[0] &&
        a.channels[1] === bc.channels[1] &&
        a.channels[2] === bc.channels[2]
      );
    }

    case 'var': {
      const bv = b as typeof a;
      if (a.name !== bv.name) return false;
      if (!a.fallback && !bv.fallback) return true;
      if (!a.fallback || !bv.fallback) return false;
      return styleValuesEqual(a.fallback, bv.fallback);
    }

    case 'tuple': {
      const bt = b as typeof a;
      if (a.values.length !== bt.values.length) return false;
      return a.values.every((v, i) => styleValuesEqual(v, bt.values[i]));
    }

    case 'unparsed':
      return a.value === (b as typeof a).value;

    default: {
      const _exhaustive: never = a;
      return false;
    }
  }
}
