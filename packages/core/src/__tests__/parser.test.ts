import { describe, it, expect } from 'bun:test';
import { parseCssValue, parseCssValues } from '../css/parser.js';
import {
  isUnitValue,
  isNumberValue,
  isKeywordValue,
  isColorValue,
  isVarValue,
  isTupleValue,
  isUnparsedValue,
  type UnitValue,
} from '../shared/css-values.js';

describe('parser', () => {
  describe('parseCssValue', () => {
    describe('UnitValue parsing', () => {
      it('should parse px values', () => {
        const result = parseCssValue('padding', '16px');
        expect(result).toEqual({ type: 'unit', value: 16, unit: 'px' });
      });

      it('should parse rem values', () => {
        const result = parseCssValue('font-size', '1.5rem');
        expect(result).toEqual({ type: 'unit', value: 1.5, unit: 'rem' });
      });

      it('should parse em values', () => {
        const result = parseCssValue('margin', '2em');
        expect(result).toEqual({ type: 'unit', value: 2, unit: 'em' });
      });

      it('should parse percentage values', () => {
        const result = parseCssValue('width', '100%');
        expect(result).toEqual({ type: 'unit', value: 100, unit: '%' });
      });

      it('should parse viewport units', () => {
        expect(parseCssValue('height', '50vh')).toEqual({ type: 'unit', value: 50, unit: 'vh' });
        expect(parseCssValue('width', '100vw')).toEqual({ type: 'unit', value: 100, unit: 'vw' });
        expect(parseCssValue('min-width', '10vmin')).toEqual({ type: 'unit', value: 10, unit: 'vmin' });
        expect(parseCssValue('max-width', '20vmax')).toEqual({ type: 'unit', value: 20, unit: 'vmax' });
      });

      it('should parse negative values', () => {
        const result = parseCssValue('margin', '-10px');
        expect(result).toEqual({ type: 'unit', value: -10, unit: 'px' });
      });

      it('should parse decimal values', () => {
        const result = parseCssValue('line-height', '1.5rem');
        expect(result).toEqual({ type: 'unit', value: 1.5, unit: 'rem' });
      });

      it('should parse zero with unit', () => {
        const result = parseCssValue('margin', '0px');
        expect(result).toEqual({ type: 'unit', value: 0, unit: 'px' });
      });
    });

    describe('NumberValue parsing', () => {
      it('should parse unitless numbers', () => {
        const result = parseCssValue('font-weight', '400');
        expect(result).toEqual({ type: 'number', value: 400 });
      });

      it('should parse zero', () => {
        const result = parseCssValue('margin', '0');
        expect(result).toEqual({ type: 'number', value: 0 });
      });

      it('should parse decimal numbers', () => {
        const result = parseCssValue('opacity', '0.5');
        expect(result).toEqual({ type: 'number', value: 0.5 });
      });

      it('should parse line-height as number', () => {
        const result = parseCssValue('line-height', '1.5');
        expect(result).toEqual({ type: 'number', value: 1.5 });
      });

      it('should parse negative numbers', () => {
        const result = parseCssValue('z-index', '-1');
        expect(result).toEqual({ type: 'number', value: -1 });
      });
    });

    describe('KeywordValue parsing', () => {
      it('should parse keyword values', () => {
        expect(parseCssValue('display', 'auto')).toEqual({ type: 'keyword', value: 'auto' });
        expect(parseCssValue('display', 'inherit')).toEqual({ type: 'keyword', value: 'inherit' });
        expect(parseCssValue('display', 'initial')).toEqual({ type: 'keyword', value: 'initial' });
        expect(parseCssValue('display', 'none')).toEqual({ type: 'keyword', value: 'none' });
        expect(parseCssValue('display', 'flex')).toEqual({ type: 'keyword', value: 'flex' });
        expect(parseCssValue('display', 'block')).toEqual({ type: 'keyword', value: 'block' });
      });

      it('should parse hyphenated keywords', () => {
        expect(parseCssValue('justify-content', 'flex-start')).toEqual({ type: 'keyword', value: 'flex-start' });
        expect(parseCssValue('justify-content', 'space-between')).toEqual({ type: 'keyword', value: 'space-between' });
      });

      it('should parse position keywords', () => {
        expect(parseCssValue('position', 'absolute')).toEqual({ type: 'keyword', value: 'absolute' });
        expect(parseCssValue('position', 'relative')).toEqual({ type: 'keyword', value: 'relative' });
        expect(parseCssValue('position', 'fixed')).toEqual({ type: 'keyword', value: 'fixed' });
      });
    });

    describe('ColorValue parsing', () => {
      it('should parse hex colors with correct RGB channels', () => {
        const result = parseCssValue('color', '#ff0000');
        expect(isColorValue(result)).toBe(true);
        if (isColorValue(result)) {
          expect(result.colorSpace).toBe('srgb');
          expect(result.channels[0]).toBeCloseTo(1, 2); // R
          expect(result.channels[1]).toBeCloseTo(0, 2); // G
          expect(result.channels[2]).toBeCloseTo(0, 2); // B
          expect(result.alpha).toBe(1);
        }
      });

      it('should parse short hex colors with correct channels', () => {
        const result = parseCssValue('color', '#f00');
        expect(isColorValue(result)).toBe(true);
        if (isColorValue(result)) {
          expect(result.channels[0]).toBeCloseTo(1, 2); // R = ff
          expect(result.channels[1]).toBeCloseTo(0, 2); // G = 00
          expect(result.channels[2]).toBeCloseTo(0, 2); // B = 00
        }
      });

      it('should parse rgb colors with correct channels', () => {
        const result = parseCssValue('background-color', 'rgb(255, 128, 64)');
        expect(isColorValue(result)).toBe(true);
        if (isColorValue(result)) {
          expect(result.channels[0]).toBeCloseTo(1, 2);      // 255/255
          expect(result.channels[1]).toBeCloseTo(0.502, 2);  // 128/255
          expect(result.channels[2]).toBeCloseTo(0.251, 2);  // 64/255
          expect(result.alpha).toBe(1);
        }
      });

      it('should parse rgba colors with correct alpha', () => {
        const result = parseCssValue('background-color', 'rgba(255, 0, 0, 0.5)');
        expect(isColorValue(result)).toBe(true);
        if (isColorValue(result)) {
          expect(result.channels[0]).toBeCloseTo(1, 2);
          expect(result.channels[1]).toBeCloseTo(0, 2);
          expect(result.channels[2]).toBeCloseTo(0, 2);
          expect(result.alpha).toBeCloseTo(0.5, 2);
        }
      });

      it('should parse hsl colors', () => {
        const result = parseCssValue('color', 'hsl(0, 100%, 50%)');
        expect(isColorValue(result)).toBe(true);
        if (isColorValue(result)) {
          // HSL(0, 100%, 50%) = pure red
          expect(result.alpha).toBe(1);
        }
      });

      it('should parse named colors with correct values', () => {
        const result = parseCssValue('color', 'red');
        expect(isColorValue(result)).toBe(true);
        if (isColorValue(result)) {
          expect(result.channels[0]).toBeCloseTo(1, 2);   // R
          expect(result.channels[1]).toBeCloseTo(0, 2);   // G
          expect(result.channels[2]).toBeCloseTo(0, 2);   // B
        }
      });

      it('should parse blue color correctly', () => {
        const result = parseCssValue('color', '#0000ff');
        expect(isColorValue(result)).toBe(true);
        if (isColorValue(result)) {
          expect(result.channels[0]).toBeCloseTo(0, 2);   // R
          expect(result.channels[1]).toBeCloseTo(0, 2);   // G
          expect(result.channels[2]).toBeCloseTo(1, 2);   // B
        }
      });

      it('should parse white color correctly', () => {
        const result = parseCssValue('color', '#ffffff');
        expect(isColorValue(result)).toBe(true);
        if (isColorValue(result)) {
          expect(result.channels[0]).toBeCloseTo(1, 2);
          expect(result.channels[1]).toBeCloseTo(1, 2);
          expect(result.channels[2]).toBeCloseTo(1, 2);
        }
      });
    });

    describe('VarValue parsing', () => {
      it('should parse var() without fallback', () => {
        const result = parseCssValue('color', 'var(--color-primary)');
        expect(result).toEqual({ type: 'var', name: '--color-primary' });
      });

      it('should parse var() with unit fallback', () => {
        const result = parseCssValue('padding', 'var(--spacing, 16px)');
        expect(isVarValue(result)).toBe(true);
        if (isVarValue(result)) {
          expect(result.name).toBe('--spacing');
          expect(result.fallback).toEqual({ type: 'unit', value: 16, unit: 'px' });
        }
      });

      it('should parse var() with keyword fallback', () => {
        const result = parseCssValue('display', 'var(--display, block)');
        expect(isVarValue(result)).toBe(true);
        if (isVarValue(result)) {
          expect(result.name).toBe('--display');
          expect(result.fallback).toEqual({ type: 'keyword', value: 'block' });
        }
      });
    });

    describe('TupleValue parsing', () => {
      it('should parse two-value margin with correct values', () => {
        const result = parseCssValue('margin', '10px 20px');
        expect(isTupleValue(result)).toBe(true);
        if (isTupleValue(result)) {
          expect(result.values).toHaveLength(2);
          expect(result.values[0]).toEqual({ type: 'unit', value: 10, unit: 'px' });
          expect(result.values[1]).toEqual({ type: 'unit', value: 20, unit: 'px' });
        }
      });

      it('should parse four-value padding with correct values', () => {
        const result = parseCssValue('padding', '10px 20px 30px 40px');
        expect(isTupleValue(result)).toBe(true);
        if (isTupleValue(result)) {
          expect(result.values).toHaveLength(4);
          expect(result.values[0]).toEqual({ type: 'unit', value: 10, unit: 'px' });
          expect(result.values[1]).toEqual({ type: 'unit', value: 20, unit: 'px' });
          expect(result.values[2]).toEqual({ type: 'unit', value: 30, unit: 'px' });
          expect(result.values[3]).toEqual({ type: 'unit', value: 40, unit: 'px' });
        }
      });

      it('should parse mixed unit values', () => {
        const result = parseCssValue('margin', '1rem 20px');
        expect(isTupleValue(result)).toBe(true);
        if (isTupleValue(result)) {
          expect(result.values[0]).toEqual({ type: 'unit', value: 1, unit: 'rem' });
          expect(result.values[1]).toEqual({ type: 'unit', value: 20, unit: 'px' });
        }
      });

      it('should parse border shorthand', () => {
        const result = parseCssValue('border', '1px solid');
        expect(isTupleValue(result)).toBe(true);
        if (isTupleValue(result)) {
          expect(result.values).toHaveLength(2);
          expect(result.values[0]).toEqual({ type: 'unit', value: 1, unit: 'px' });
          expect(result.values[1]).toEqual({ type: 'keyword', value: 'solid' });
        }
      });
    });

    describe('UnparsedValue parsing (80% approach)', () => {
      it('should return unparsed for calc()', () => {
        const result = parseCssValue('width', 'calc(100% - 20px)');
        expect(result).toEqual({ type: 'unparsed', value: 'calc(100% - 20px)' });
      });

      it('should return unparsed for min()', () => {
        const result = parseCssValue('width', 'min(100px, 50%)');
        expect(result).toEqual({ type: 'unparsed', value: 'min(100px, 50%)' });
      });

      it('should return unparsed for max()', () => {
        const result = parseCssValue('width', 'max(100px, 50%)');
        expect(result).toEqual({ type: 'unparsed', value: 'max(100px, 50%)' });
      });

      it('should return unparsed for clamp()', () => {
        const result = parseCssValue('font-size', 'clamp(1rem, 2vw, 3rem)');
        expect(result).toEqual({ type: 'unparsed', value: 'clamp(1rem, 2vw, 3rem)' });
      });

      it('should return unparsed for linear-gradient', () => {
        const result = parseCssValue('background', 'linear-gradient(red, blue)');
        expect(isUnparsedValue(result)).toBe(true);
        if (isUnparsedValue(result)) {
          expect(result.value).toContain('linear-gradient');
        }
      });

      it('should return unparsed for radial-gradient', () => {
        const result = parseCssValue('background', 'radial-gradient(circle, red, blue)');
        expect(isUnparsedValue(result)).toBe(true);
      });

      it('should return unparsed for url()', () => {
        const result = parseCssValue('background-image', 'url(image.png)');
        expect(isUnparsedValue(result)).toBe(true);
        if (isUnparsedValue(result)) {
          expect(result.value).toContain('url');
        }
      });
    });

    describe('Edge cases', () => {
      it('should handle empty string', () => {
        const result = parseCssValue('padding', '');
        expect(result).toEqual({ type: 'unparsed', value: '' });
      });

      it('should handle whitespace and return trimmed value', () => {
        const result = parseCssValue('padding', '  16px  ');
        expect(result).toEqual({ type: 'unit', value: 16, unit: 'px' });
      });

      it('should handle leading zeros', () => {
        const result = parseCssValue('opacity', '0.75');
        expect(result).toEqual({ type: 'number', value: 0.75 });
      });
    });
  });

  describe('parseCssValues', () => {
    it('should return array with single value', () => {
      const result = parseCssValues('padding', '16px');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'unit', value: 16, unit: 'px' });
    });

    it('should return array with multiple values', () => {
      const result = parseCssValues('margin', '10px 20px');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'unit', value: 10, unit: 'px' });
      expect(result[1]).toEqual({ type: 'unit', value: 20, unit: 'px' });
    });

    it('should return array with four values', () => {
      const result = parseCssValues('padding', '1px 2px 3px 4px');
      expect(result).toHaveLength(4);
      expect((result[0] as UnitValue).value).toBe(1);
      expect((result[1] as UnitValue).value).toBe(2);
      expect((result[2] as UnitValue).value).toBe(3);
      expect((result[3] as UnitValue).value).toBe(4);
    });
  });
});
