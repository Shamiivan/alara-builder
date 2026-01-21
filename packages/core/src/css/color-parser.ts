import Color from 'colorjs.io';
import {
  type ColorValue,
  type ColorSpace,
  createColorValue,
} from '../shared/css-values.js';

// ============================================================================
// Color Parsing
// ============================================================================

/**
 * Map colorjs.io color space IDs to our ColorSpace type
 */
const COLOR_SPACE_MAP: Record<string, ColorSpace> = {
  srgb: 'srgb',
  hsl: 'hsl',
  oklch: 'oklch',
  oklab: 'oklab',
  'display-p3': 'display-p3',
  p3: 'display-p3',
};

/**
 * Parse a CSS color string into a ColorValue.
 *
 * Supports: hex, rgb, rgba, hsl, hsla, oklch, oklab, named colors
 *
 * @param input - CSS color string (e.g., "#ff0000", "rgb(255, 0, 0)", "red")
 * @returns ColorValue or null if parsing fails
 */
export function parseColor(input: string): ColorValue | null {
  if (!input || typeof input !== 'string') return null;

  try {
    const color = new Color(input);

    // Determine the color space
    let colorSpace: ColorSpace = 'srgb';
    const spaceId = color.spaceId;

    if (spaceId in COLOR_SPACE_MAP) {
      colorSpace = COLOR_SPACE_MAP[spaceId];
    }

    // Get the channels in the appropriate space
    // Note: colorjs.io may return boxed Number objects, so we convert to primitives
    const coords = color.coords;
    const channels: [number, number, number] = [
      Number(coords[0] ?? 0),
      Number(coords[1] ?? 0),
      Number(coords[2] ?? 0),
    ];

    // Get alpha (defaults to 1 if not specified)
    // Note: colorjs.io may return boxed Number objects, so we convert to primitive
    const alpha = Number(color.alpha ?? 1);

    return createColorValue(colorSpace, channels, alpha);
  } catch {
    return null;
  }
}

/**
 * Convert a ColorValue to a CSS color string.
 *
 * @param colorValue - ColorValue to serialize
 * @param format - Output format (optional, defaults to color space appropriate format)
 * @returns CSS color string
 */
export function colorToString(
  colorValue: ColorValue,
  format?: 'hex' | 'rgb' | 'hsl' | 'oklch' | 'oklab'
): string {
  const { colorSpace, channels, alpha } = colorValue;

  try {
    // Create a Color instance
    const color = new Color(colorSpace, channels, alpha);

    // If a specific format is requested, convert to it
    if (format) {
      switch (format) {
        case 'hex':
          return color.to('srgb').toString({ format: 'hex' });
        case 'rgb':
          return color.to('srgb').toString({ format: 'rgb' });
        case 'hsl':
          return color.to('hsl').toString({ format: 'hsl' });
        case 'oklch':
          return color.to('oklch').toString({ format: 'oklch' });
        case 'oklab':
          return color.to('oklab').toString({ format: 'oklab' });
      }
    }

    // Default: use the native color space format
    switch (colorSpace) {
      case 'srgb':
        // For sRGB, prefer hex for fully opaque colors, rgb for transparent
        if (alpha === 1) {
          return color.toString({ format: 'hex' });
        }
        return color.toString({ format: 'rgb' });
      case 'hsl':
        return color.toString({ format: 'hsl' });
      case 'oklch':
        return color.toString({ format: 'oklch' });
      case 'oklab':
        return color.toString({ format: 'oklab' });
      case 'display-p3':
        return color.toString({ format: 'color' });
      default:
        return color.toString();
    }
  } catch {
    // Fallback: construct manually
    if (colorSpace === 'srgb') {
      const [r, g, b] = channels;
      if (alpha === 1) {
        return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      }
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
    }
    if (colorSpace === 'hsl') {
      const [h, s, l] = channels;
      if (alpha === 1) {
        return `hsl(${h}, ${s}%, ${l}%)`;
      }
      return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
    }
    if (colorSpace === 'oklch') {
      const [l, c, h] = channels;
      if (alpha === 1) {
        return `oklch(${l} ${c} ${h})`;
      }
      return `oklch(${l} ${c} ${h} / ${alpha})`;
    }

    // Generic fallback
    return `color(${colorSpace} ${channels.join(' ')}${alpha < 1 ? ` / ${alpha}` : ''})`;
  }
}

/**
 * Check if a string looks like a color value.
 *
 * @param value - String to check
 * @returns true if value appears to be a color
 */
export function isColorString(value: string): boolean {
  if (!value || typeof value !== 'string') return false;

  const trimmed = value.trim().toLowerCase();

  // Check for common color formats
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('rgb')) return true;
  if (trimmed.startsWith('hsl')) return true;
  if (trimmed.startsWith('oklch')) return true;
  if (trimmed.startsWith('oklab')) return true;
  if (trimmed.startsWith('color(')) return true;

  // Check for named colors (simplified list of common ones)
  const namedColors = [
    'transparent',
    'currentcolor',
    'inherit',
    'initial',
    'unset',
    'black',
    'white',
    'red',
    'green',
    'blue',
    'yellow',
    'orange',
    'purple',
    'pink',
    'gray',
    'grey',
    'cyan',
    'magenta',
  ];

  return namedColors.includes(trimmed);
}

/**
 * Convert a ColorValue to a different color space.
 *
 * @param colorValue - ColorValue to convert
 * @param targetSpace - Target color space
 * @returns New ColorValue in the target space
 */
export function convertColorSpace(
  colorValue: ColorValue,
  targetSpace: ColorSpace
): ColorValue {
  const { colorSpace, channels, alpha } = colorValue;

  try {
    const color = new Color(colorSpace, channels, alpha);
    const converted = color.to(targetSpace);

    return createColorValue(
      targetSpace,
      [converted.coords[0] ?? 0, converted.coords[1] ?? 0, converted.coords[2] ?? 0],
      converted.alpha ?? 1
    );
  } catch {
    // Return original if conversion fails
    return colorValue;
  }
}
