import * as csstree from 'css-tree';
import {
  type StyleValue,
  type CSSUnit,
  CSSUnits,
  createUnitValue,
  createNumberValue,
  createKeywordValue,
  createVarValue,
  createTupleValue,
  createUnparsedValue,
} from '../shared/css-values.js';
import { parseColor, isColorString } from './color-parser.js';

// ============================================================================
// CSS Value Parser
// ============================================================================

/**
 * Parse a CSS property value into a StyleValue.
 *
 * Uses css-tree for tokenization and parsing. Returns UnparsedValue for
 * complex values like calc(), gradients, and shadows (80% approach).
 *
 * @param property - CSS property name (e.g., 'padding', 'color')
 * @param value - CSS value string (e.g., '16px', 'red', 'var(--spacing)')
 * @returns Parsed StyleValue
 */
export function parseCssValue(property: string, value: string): StyleValue {
  if (!value || typeof value !== 'string') {
    return createUnparsedValue(value ?? '');
  }

  const trimmed = value.trim();

  // Handle empty values
  if (!trimmed) {
    return createUnparsedValue('');
  }

  // Quick check for complex values we don't parse (80% approach)
  if (isComplexValue(trimmed)) {
    return createUnparsedValue(trimmed);
  }

  // Try to parse with css-tree
  try {
    const ast = csstree.parse(trimmed, { context: 'value' });

    if (ast.type === 'Value' && ast.children) {
      const children = Array.from(ast.children);

      // Single value
      if (children.length === 1) {
        return parseNode(children[0], property);
      }

      // Multiple values (tuple) - handle shorthand properties
      if (children.length > 1) {
        const values = children
          .filter((node) => node.type !== 'WhiteSpace')
          .map((node) => parseNode(node, property));

        // If all values are the same (e.g., "10px 10px 10px 10px")
        // we could normalize, but for now keep as tuple
        return createTupleValue(values);
      }
    }

    // Fallback for edge cases
    return createUnparsedValue(trimmed);
  } catch {
    // css-tree parsing failed, try our own parsing
    return fallbackParse(property, trimmed);
  }
}

/**
 * Parse a single css-tree node into a StyleValue.
 */
function parseNode(node: csstree.CssNode, property: string): StyleValue {
  switch (node.type) {
    case 'Dimension': {
      const unit = node.unit.toLowerCase();
      if (isCSSUnit(unit)) {
        return createUnitValue(parseFloat(node.value), unit);
      }
      // Unknown unit, return as unparsed
      return createUnparsedValue(`${node.value}${node.unit}`);
    }

    case 'Percentage':
      return createUnitValue(parseFloat(node.value), '%');

    case 'Number':
      return createNumberValue(parseFloat(node.value));

    case 'Identifier': {
      const ident = node.name;

      // Check if it's a color keyword
      if (isColorProperty(property) && isColorString(ident)) {
        const color = parseColor(ident);
        if (color) return color;
      }

      return createKeywordValue(ident);
    }

    case 'Hash': {
      // Hex color
      const hex = `#${node.value}`;
      const color = parseColor(hex);
      if (color) return color;
      return createUnparsedValue(hex);
    }

    case 'Function': {
      const funcName = node.name.toLowerCase();

      // Handle var()
      if (funcName === 'var') {
        return parseVarFunction(node);
      }

      // Handle color functions
      if (isColorFunction(funcName)) {
        const colorStr = csstree.generate(node);
        const color = parseColor(colorStr);
        if (color) return color;
      }

      // Other functions (calc, gradients, etc.) - return as unparsed
      return createUnparsedValue(csstree.generate(node));
    }

    case 'String':
      // Quoted strings - treat as keyword for now
      return createKeywordValue(node.value);

    case 'Url':
      // url() - return as unparsed
      return createUnparsedValue(csstree.generate(node));

    default:
      // Unknown node type
      return createUnparsedValue(csstree.generate(node));
  }
}

/**
 * Parse a var() function node.
 */
function parseVarFunction(node: csstree.FunctionNode): StyleValue {
  const children = Array.from(node.children);

  // First child should be a custom property identifier
  const firstChild = children[0];
  if (!firstChild || firstChild.type !== 'Identifier') {
    return createUnparsedValue(csstree.generate(node));
  }

  const varName = firstChild.name;

  // Check for fallback (after comma)
  const commaIndex = children.findIndex(
    (c) => c.type === 'Operator' && (c as csstree.Operator).value === ','
  );

  if (commaIndex > 0 && commaIndex < children.length - 1) {
    // There's a fallback value
    const fallbackNodes = children.slice(commaIndex + 1);
    const fallbackStr = fallbackNodes
      .map((n) => csstree.generate(n))
      .join('')
      .trim();

    if (fallbackStr) {
      const fallbackValue = parseCssValue('', fallbackStr);
      return createVarValue(varName, fallbackValue);
    }
  }

  return createVarValue(varName);
}

/**
 * Fallback parsing for when css-tree fails.
 */
function fallbackParse(property: string, value: string): StyleValue {
  // Try parsing as a simple dimension (number + unit)
  const dimensionMatch = value.match(/^(-?\d*\.?\d+)(px|rem|em|%|vh|vw|vmin|vmax)$/i);
  if (dimensionMatch) {
    const num = parseFloat(dimensionMatch[1]);
    const unit = dimensionMatch[2].toLowerCase();
    if (isCSSUnit(unit)) {
      return createUnitValue(num, unit);
    }
  }

  // Try parsing as a simple number
  const num = parseFloat(value);
  if (!isNaN(num) && value === String(num)) {
    return createNumberValue(num);
  }

  // Try parsing as a color
  if (isColorProperty(property) || isColorString(value)) {
    const color = parseColor(value);
    if (color) return color;
  }

  // Check if it's a simple keyword (single word, no special chars)
  if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(value)) {
    return createKeywordValue(value);
  }

  // Give up, return as unparsed
  return createUnparsedValue(value);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a unit is one of our supported CSS units.
 */
function isCSSUnit(unit: string): unit is CSSUnit {
  return CSSUnits.includes(unit as CSSUnit);
}

/**
 * Check if a property typically accepts color values.
 */
function isColorProperty(property: string): boolean {
  const colorProperties = [
    'color',
    'background-color',
    'border-color',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'outline-color',
    'text-decoration-color',
    'fill',
    'stroke',
    'caret-color',
    'accent-color',
  ];
  return colorProperties.includes(property.toLowerCase());
}

/**
 * Check if a function name is a color function.
 */
function isColorFunction(funcName: string): boolean {
  const colorFunctions = ['rgb', 'rgba', 'hsl', 'hsla', 'oklch', 'oklab', 'color'];
  return colorFunctions.includes(funcName.toLowerCase());
}

/**
 * Check if a value is complex and should be returned as UnparsedValue.
 *
 * This is part of the 80% approach - we handle the common cases and
 * leave complex values for later phases.
 */
function isComplexValue(value: string): boolean {
  const lower = value.toLowerCase();

  // calc() and other math functions
  if (/\bcalc\s*\(/.test(lower)) return true;
  if (/\bmin\s*\(/.test(lower)) return true;
  if (/\bmax\s*\(/.test(lower)) return true;
  if (/\bclamp\s*\(/.test(lower)) return true;

  // Gradients
  if (/gradient\s*\(/.test(lower)) return true;

  // Images
  if (/\burl\s*\(/.test(lower)) return true;
  if (/\bimage\s*\(/.test(lower)) return true;

  // Complex shadow values (multiple shadows)
  if (value.includes(',') && /shadow/i.test(value)) return true;

  return false;
}

/**
 * Parse multiple CSS values separated by whitespace.
 *
 * @param property - CSS property name
 * @param value - CSS value string with multiple values
 * @returns Array of StyleValues
 */
export function parseCssValues(property: string, value: string): StyleValue[] {
  const result = parseCssValue(property, value);

  if (result.type === 'tuple') {
    return result.values;
  }

  return [result];
}
