import { describe, it, expect } from 'bun:test';
import {
  parseColor,
  colorToString,
  isColorString,
  convertColorSpace,
} from '../css/color-parser.js';
import { createColorValue } from '../shared/css-values.js';

describe('color-parser', () => {
  describe('parseColor', () => {
    it('should parse hex colors', () => {
      const color = parseColor('#ff0000');
      expect(color).not.toBeNull();
      expect(color?.colorSpace).toBe('srgb');
      expect(color?.alpha).toBe(1);
    });

    it('should parse short hex colors', () => {
      const color = parseColor('#f00');
      expect(color).not.toBeNull();
      expect(color?.colorSpace).toBe('srgb');
    });

    it('should parse hex with alpha', () => {
      const color = parseColor('#ff000080');
      expect(color).not.toBeNull();
      expect(color?.alpha).toBeCloseTo(0.5, 1);
    });

    it('should parse rgb colors', () => {
      const color = parseColor('rgb(255, 0, 0)');
      expect(color).not.toBeNull();
      expect(color?.colorSpace).toBe('srgb');
    });

    it('should parse rgba colors', () => {
      const color = parseColor('rgba(255, 0, 0, 0.5)');
      expect(color).not.toBeNull();
      if (color) {
        expect(color.alpha).toBeCloseTo(0.5, 1);
      }
    });

    it('should parse hsl colors', () => {
      const color = parseColor('hsl(0, 100%, 50%)');
      expect(color).not.toBeNull();
    });

    it('should parse hsla colors', () => {
      const color = parseColor('hsla(0, 100%, 50%, 0.5)');
      expect(color).not.toBeNull();
      if (color) {
        expect(color.alpha).toBeCloseTo(0.5, 1);
      }
    });

    it('should parse named colors', () => {
      const colors = ['red', 'blue', 'green', 'white', 'black'];
      for (const name of colors) {
        const color = parseColor(name);
        expect(color).not.toBeNull();
      }
    });

    it('should parse oklch colors', () => {
      const color = parseColor('oklch(0.7 0.15 30)');
      expect(color).not.toBeNull();
    });

    it('should return null for invalid colors', () => {
      expect(parseColor('')).toBeNull();
      expect(parseColor('invalid')).toBeNull();
      expect(parseColor('not-a-color')).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      expect(parseColor(null as unknown as string)).toBeNull();
      expect(parseColor(undefined as unknown as string)).toBeNull();
    });
  });

  describe('colorToString', () => {
    it('should serialize srgb colors to hex', () => {
      const color = createColorValue('srgb', [1, 0, 0], 1);
      const str = colorToString(color);
      expect(str).toMatch(/^#/);
    });

    it('should serialize srgb with alpha to rgba', () => {
      const color = createColorValue('srgb', [1, 0, 0], 0.5);
      const str = colorToString(color);
      expect(str).toMatch(/rgb/i);
    });

    it('should serialize hsl colors', () => {
      const color = createColorValue('hsl', [0, 100, 50], 1);
      const str = colorToString(color);
      expect(str).toMatch(/hsl/i);
    });

    it('should serialize oklch colors', () => {
      const color = createColorValue('oklch', [0.7, 0.15, 30], 1);
      const str = colorToString(color);
      expect(str).toMatch(/oklch/i);
    });

    it('should convert to specific format', () => {
      const color = createColorValue('srgb', [1, 0, 0], 1);

      const hex = colorToString(color, 'hex');
      expect(hex).toMatch(/^#/);

      const rgb = colorToString(color, 'rgb');
      expect(rgb).toMatch(/rgb/i);

      const hsl = colorToString(color, 'hsl');
      expect(hsl).toMatch(/hsl/i);
    });
  });

  describe('isColorString', () => {
    it('should identify hex colors', () => {
      expect(isColorString('#ff0000')).toBe(true);
      expect(isColorString('#f00')).toBe(true);
      expect(isColorString('#ff000080')).toBe(true);
    });

    it('should identify rgb/rgba colors', () => {
      expect(isColorString('rgb(255, 0, 0)')).toBe(true);
      expect(isColorString('rgba(255, 0, 0, 0.5)')).toBe(true);
    });

    it('should identify hsl/hsla colors', () => {
      expect(isColorString('hsl(0, 100%, 50%)')).toBe(true);
      expect(isColorString('hsla(0, 100%, 50%, 0.5)')).toBe(true);
    });

    it('should identify named colors', () => {
      expect(isColorString('red')).toBe(true);
      expect(isColorString('blue')).toBe(true);
      expect(isColorString('transparent')).toBe(true);
    });

    it('should reject non-colors', () => {
      expect(isColorString('auto')).toBe(false);
      expect(isColorString('16px')).toBe(false);
      expect(isColorString('flex')).toBe(false);
    });

    it('should handle empty/invalid input', () => {
      expect(isColorString('')).toBe(false);
      expect(isColorString(null as unknown as string)).toBe(false);
    });
  });

  describe('convertColorSpace', () => {
    it('should convert srgb to hsl', () => {
      const srgb = createColorValue('srgb', [1, 0, 0], 1);
      const hsl = convertColorSpace(srgb, 'hsl');
      expect(hsl.colorSpace).toBe('hsl');
      expect(hsl.alpha).toBe(1);
    });

    it('should convert srgb to oklch', () => {
      const srgb = createColorValue('srgb', [1, 0, 0], 1);
      const oklch = convertColorSpace(srgb, 'oklch');
      expect(oklch.colorSpace).toBe('oklch');
    });

    it('should preserve alpha during conversion', () => {
      const srgb = createColorValue('srgb', [1, 0, 0], 0.5);
      const hsl = convertColorSpace(srgb, 'hsl');
      expect(hsl.alpha).toBeCloseTo(0.5, 1);
    });
  });

  describe('round-trip parsing', () => {
    it('should round-trip hex colors', () => {
      const original = '#ff0000';
      const parsed = parseColor(original);
      expect(parsed).not.toBeNull();
      const serialized = colorToString(parsed!, 'hex');
      // colorjs.io may shorten hex colors (#ff0000 -> #f00)
      // Parse both and compare channels
      const reparsed = parseColor(serialized);
      expect(reparsed).not.toBeNull();
      expect(reparsed?.channels[0]).toBeCloseTo(parsed!.channels[0], 2);
      expect(reparsed?.channels[1]).toBeCloseTo(parsed!.channels[1], 2);
      expect(reparsed?.channels[2]).toBeCloseTo(parsed!.channels[2], 2);
    });

    it('should round-trip rgb colors', () => {
      const original = 'rgb(255, 128, 64)';
      const parsed = parseColor(original);
      expect(parsed).not.toBeNull();
      // After parsing and serializing, values should be equivalent
      const reparsed = parseColor(colorToString(parsed!));
      expect(reparsed).not.toBeNull();
      expect(reparsed?.channels[0]).toBeCloseTo(parsed!.channels[0], 2);
    });
  });
});
