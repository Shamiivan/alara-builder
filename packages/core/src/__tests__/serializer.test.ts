import { describe, it, expect } from 'bun:test';
import {
  toValue,
  formatNumber,
  serializeStyleValue,
  styleValuesEqual,
} from '../css/serializer.js';
import {
  createUnitValue,
  createNumberValue,
  createKeywordValue,
  createColorValue,
  createVarValue,
  createTupleValue,
  createUnparsedValue,
} from '../shared/css-values.js';

describe('serializer', () => {
  describe('toValue', () => {
    it('should serialize UnitValue', () => {
      expect(toValue(createUnitValue(16, 'px'))).toBe('16px');
      expect(toValue(createUnitValue(1.5, 'rem'))).toBe('1.5rem');
      expect(toValue(createUnitValue(100, '%'))).toBe('100%');
      expect(toValue(createUnitValue(50, 'vh'))).toBe('50vh');
    });

    it('should serialize NumberValue', () => {
      expect(toValue(createNumberValue(0))).toBe('0');
      expect(toValue(createNumberValue(1.5))).toBe('1.5');
      expect(toValue(createNumberValue(400))).toBe('400');
    });

    it('should serialize KeywordValue', () => {
      expect(toValue(createKeywordValue('auto'))).toBe('auto');
      expect(toValue(createKeywordValue('flex-start'))).toBe('flex-start');
      expect(toValue(createKeywordValue('inherit'))).toBe('inherit');
    });

    it('should serialize ColorValue', () => {
      const red = createColorValue('srgb', [1, 0, 0], 1);
      const serialized = toValue(red);
      expect(serialized).toMatch(/#|rgb/i);
    });

    it('should serialize VarValue without fallback', () => {
      expect(toValue(createVarValue('--color-primary'))).toBe('var(--color-primary)');
    });

    it('should serialize VarValue with fallback', () => {
      const fallback = createUnitValue(16, 'px');
      expect(toValue(createVarValue('--spacing', fallback))).toBe('var(--spacing, 16px)');
    });

    it('should serialize TupleValue', () => {
      const tuple = createTupleValue([
        createUnitValue(10, 'px'),
        createUnitValue(20, 'px'),
      ]);
      expect(toValue(tuple)).toBe('10px 20px');
    });

    it('should serialize UnparsedValue', () => {
      expect(toValue(createUnparsedValue('calc(100% - 20px)'))).toBe('calc(100% - 20px)');
    });

    it('should handle negative values', () => {
      expect(toValue(createUnitValue(-10, 'px'))).toBe('-10px');
    });

    it('should handle decimal values', () => {
      expect(toValue(createUnitValue(0.5, 'em'))).toBe('0.5em');
    });
  });

  describe('formatNumber', () => {
    it('should format zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('should format integers', () => {
      expect(formatNumber(16)).toBe('16');
      expect(formatNumber(-10)).toBe('-10');
    });

    it('should format decimals', () => {
      expect(formatNumber(1.5)).toBe('1.5');
      expect(formatNumber(0.25)).toBe('0.25');
    });

    it('should remove trailing zeros', () => {
      expect(formatNumber(1.0)).toBe('1');
      expect(formatNumber(1.50)).toBe('1.5');
      expect(formatNumber(1.500)).toBe('1.5');
    });

    it('should limit decimal places', () => {
      const result = formatNumber(1.123456789, 4);
      expect(result).toBe('1.1235');
    });

    it('should handle custom max decimals', () => {
      expect(formatNumber(1.12345, 2)).toBe('1.12');
      expect(formatNumber(1.99999, 2)).toBe('2');
    });
  });

  describe('serializeStyleValue', () => {
    it('should use default options', () => {
      const value = createUnitValue(16, 'px');
      expect(serializeStyleValue(value)).toBe('16px');
    });

    it('should respect maxDecimals option', () => {
      const value = createUnitValue(1.123456, 'rem');
      expect(serializeStyleValue(value, { maxDecimals: 2 })).toBe('1.12rem');
    });

    it('should respect colorFormat option', () => {
      const color = createColorValue('srgb', [1, 0, 0], 1);
      expect(serializeStyleValue(color, { colorFormat: 'hex' })).toMatch(/^#/);
      expect(serializeStyleValue(color, { colorFormat: 'rgb' })).toMatch(/rgb/i);
    });

    it('should collapse tuple values with useShorthand', () => {
      const tuple = createTupleValue([
        createUnitValue(10, 'px'),
        createUnitValue(10, 'px'),
        createUnitValue(10, 'px'),
        createUnitValue(10, 'px'),
      ]);
      expect(serializeStyleValue(tuple, { useShorthand: true })).toBe('10px');
    });

    it('should collapse pairs with useShorthand', () => {
      const tuple = createTupleValue([
        createUnitValue(10, 'px'),
        createUnitValue(20, 'px'),
        createUnitValue(10, 'px'),
        createUnitValue(20, 'px'),
      ]);
      expect(serializeStyleValue(tuple, { useShorthand: true })).toBe('10px 20px');
    });
  });

  describe('styleValuesEqual', () => {
    it('should compare UnitValues', () => {
      const a = createUnitValue(16, 'px');
      const b = createUnitValue(16, 'px');
      const c = createUnitValue(20, 'px');
      const d = createUnitValue(16, 'rem');

      expect(styleValuesEqual(a, b)).toBe(true);
      expect(styleValuesEqual(a, c)).toBe(false);
      expect(styleValuesEqual(a, d)).toBe(false);
    });

    it('should compare NumberValues', () => {
      const a = createNumberValue(1.5);
      const b = createNumberValue(1.5);
      const c = createNumberValue(2);

      expect(styleValuesEqual(a, b)).toBe(true);
      expect(styleValuesEqual(a, c)).toBe(false);
    });

    it('should compare KeywordValues', () => {
      const a = createKeywordValue('auto');
      const b = createKeywordValue('auto');
      const c = createKeywordValue('none');

      expect(styleValuesEqual(a, b)).toBe(true);
      expect(styleValuesEqual(a, c)).toBe(false);
    });

    it('should compare ColorValues', () => {
      const a = createColorValue('srgb', [1, 0, 0], 1);
      const b = createColorValue('srgb', [1, 0, 0], 1);
      const c = createColorValue('srgb', [0, 1, 0], 1);
      const d = createColorValue('srgb', [1, 0, 0], 0.5);

      expect(styleValuesEqual(a, b)).toBe(true);
      expect(styleValuesEqual(a, c)).toBe(false);
      expect(styleValuesEqual(a, d)).toBe(false);
    });

    it('should compare VarValues', () => {
      const a = createVarValue('--test');
      const b = createVarValue('--test');
      const c = createVarValue('--other');
      const d = createVarValue('--test', createUnitValue(16, 'px'));

      expect(styleValuesEqual(a, b)).toBe(true);
      expect(styleValuesEqual(a, c)).toBe(false);
      expect(styleValuesEqual(a, d)).toBe(false);
    });

    it('should compare TupleValues', () => {
      const a = createTupleValue([createUnitValue(10, 'px'), createUnitValue(20, 'px')]);
      const b = createTupleValue([createUnitValue(10, 'px'), createUnitValue(20, 'px')]);
      const c = createTupleValue([createUnitValue(10, 'px')]);

      expect(styleValuesEqual(a, b)).toBe(true);
      expect(styleValuesEqual(a, c)).toBe(false);
    });

    it('should compare UnparsedValues', () => {
      const a = createUnparsedValue('calc(100% - 20px)');
      const b = createUnparsedValue('calc(100% - 20px)');
      const c = createUnparsedValue('calc(50% + 10px)');

      expect(styleValuesEqual(a, b)).toBe(true);
      expect(styleValuesEqual(a, c)).toBe(false);
    });

    it('should return false for different types', () => {
      const unit = createUnitValue(16, 'px');
      const number = createNumberValue(16);
      const keyword = createKeywordValue('auto');

      expect(styleValuesEqual(unit, number)).toBe(false);
      expect(styleValuesEqual(unit, keyword)).toBe(false);
      expect(styleValuesEqual(number, keyword)).toBe(false);
    });
  });
});
