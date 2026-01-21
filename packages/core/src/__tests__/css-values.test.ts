import { describe, it, expect } from 'bun:test';
import {
  // Schemas
  StyleValueSchema,
  UnitValueSchema,
  NumberValueSchema,
  KeywordValueSchema,
  ColorValueSchema,
  // Type Guards
  isUnitValue,
  isNumberValue,
  isKeywordValue,
  isColorValue,
  isVarValue,
  isTupleValue,
  isUnparsedValue,
  // Factory Functions
  createUnitValue,
  createNumberValue,
  createKeywordValue,
  createColorValue,
  createVarValue,
  createTupleValue,
  createUnparsedValue,
  // Types
  type StyleValue,
} from '../shared/css-values.js';

describe('css-values', () => {
  describe('UnitValue', () => {
    it('should create valid unit values', () => {
      const value = createUnitValue(16, 'px');
      expect(value).toEqual({ type: 'unit', value: 16, unit: 'px' });
    });

    it('should validate unit values with Zod', () => {
      const value = { type: 'unit', value: 16, unit: 'px' };
      const result = UnitValueSchema.safeParse(value);
      expect(result.success).toBe(true);
    });

    it('should reject invalid units', () => {
      const value = { type: 'unit', value: 16, unit: 'invalid' };
      const result = UnitValueSchema.safeParse(value);
      expect(result.success).toBe(false);
    });

    it('should support all 8 CSS units', () => {
      const units = ['px', 'rem', 'em', '%', 'vh', 'vw', 'vmin', 'vmax'] as const;
      for (const unit of units) {
        const value = createUnitValue(10, unit);
        expect(isUnitValue(value)).toBe(true);
        expect(value.unit).toBe(unit);
      }
    });
  });

  describe('NumberValue', () => {
    it('should create valid number values', () => {
      const value = createNumberValue(1.5);
      expect(value).toEqual({ type: 'number', value: 1.5 });
    });

    it('should validate number values', () => {
      const value = { type: 'number', value: 400 };
      const result = NumberValueSchema.safeParse(value);
      expect(result.success).toBe(true);
    });
  });

  describe('KeywordValue', () => {
    it('should create valid keyword values', () => {
      const value = createKeywordValue('auto');
      expect(value).toEqual({ type: 'keyword', value: 'auto' });
    });

    it('should validate keyword values', () => {
      const value = { type: 'keyword', value: 'flex-start' };
      const result = KeywordValueSchema.safeParse(value);
      expect(result.success).toBe(true);
    });
  });

  describe('ColorValue', () => {
    it('should create valid color values', () => {
      const value = createColorValue('srgb', [1, 0, 0], 1);
      expect(value).toEqual({
        type: 'color',
        colorSpace: 'srgb',
        channels: [1, 0, 0],
        alpha: 1,
      });
    });

    it('should validate color values', () => {
      const value = {
        type: 'color',
        colorSpace: 'srgb',
        channels: [0.5, 0.5, 0.5],
        alpha: 0.8,
      };
      const result = ColorValueSchema.safeParse(value);
      expect(result.success).toBe(true);
    });

    it('should reject alpha values outside 0-1', () => {
      const value = {
        type: 'color',
        colorSpace: 'srgb',
        channels: [0.5, 0.5, 0.5],
        alpha: 1.5,
      };
      const result = ColorValueSchema.safeParse(value);
      expect(result.success).toBe(false);
    });
  });

  describe('VarValue', () => {
    it('should create var values without fallback', () => {
      const value = createVarValue('--color-primary');
      expect(value).toEqual({ type: 'var', name: '--color-primary' });
    });

    it('should create var values with fallback', () => {
      const fallback = createUnitValue(16, 'px');
      const value = createVarValue('--spacing', fallback);
      expect(value).toEqual({
        type: 'var',
        name: '--spacing',
        fallback: { type: 'unit', value: 16, unit: 'px' },
      });
    });
  });

  describe('TupleValue', () => {
    it('should create tuple values', () => {
      const values = [createUnitValue(10, 'px'), createUnitValue(20, 'px')];
      const tuple = createTupleValue(values);
      expect(tuple.type).toBe('tuple');
      expect(tuple.values).toHaveLength(2);
    });
  });

  describe('UnparsedValue', () => {
    it('should create unparsed values', () => {
      const value = createUnparsedValue('calc(100% - 20px)');
      expect(value).toEqual({ type: 'unparsed', value: 'calc(100% - 20px)' });
    });
  });

  describe('StyleValueSchema discriminated union', () => {
    it('should validate different value types', () => {
      const testCases: StyleValue[] = [
        { type: 'unit', value: 16, unit: 'px' },
        { type: 'number', value: 1.5 },
        { type: 'keyword', value: 'auto' },
        { type: 'color', colorSpace: 'srgb', channels: [1, 0, 0], alpha: 1 },
        { type: 'var', name: '--test' },
        { type: 'tuple', values: [{ type: 'number', value: 1 }] },
        { type: 'unparsed', value: 'complex' },
      ];

      for (const value of testCases) {
        const result = StyleValueSchema.safeParse(value);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Type Guards', () => {
    it('should correctly identify value types', () => {
      expect(isUnitValue(createUnitValue(16, 'px'))).toBe(true);
      expect(isNumberValue(createNumberValue(1.5))).toBe(true);
      expect(isKeywordValue(createKeywordValue('auto'))).toBe(true);
      expect(isColorValue(createColorValue('srgb', [1, 0, 0], 1))).toBe(true);
      expect(isVarValue(createVarValue('--test'))).toBe(true);
      expect(isTupleValue(createTupleValue([]))).toBe(true);
      expect(isUnparsedValue(createUnparsedValue('test'))).toBe(true);
    });

    it('should return false for wrong types', () => {
      const unitValue = createUnitValue(16, 'px');
      expect(isNumberValue(unitValue)).toBe(false);
      expect(isKeywordValue(unitValue)).toBe(false);
      expect(isColorValue(unitValue)).toBe(false);
    });
  });
});
