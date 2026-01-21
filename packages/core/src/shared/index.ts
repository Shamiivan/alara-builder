// CSS Values - Types and Schemas
export {
  // Units
  CSSUnits,
  CSSUnitSchema,
  type CSSUnit,
  // Color Spaces
  ColorSpaces,
  ColorSpaceSchema,
  type ColorSpace,
  // StyleValue Types
  UnitValueSchema,
  NumberValueSchema,
  KeywordValueSchema,
  ColorValueSchema,
  VarValueSchema,
  TupleValueSchema,
  UnparsedValueSchema,
  StyleValueSchema,
  type UnitValue,
  type NumberValue,
  type KeywordValue,
  type ColorValue,
  type VarValue,
  type TupleValue,
  type UnparsedValue,
  type StyleValue,
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
} from './css-values.js';

// Elements - ElementTarget types
export {
  ElementTargetSchema,
  type ElementTarget,
  parseOid,
  parseCssAttribute,
  parseElementTarget,
  getElementTarget,
  findEditableElement,
} from './elements.js';

// Transforms - Request/Response types
export {
  // Transform Types
  TransformTypes,
  TransformTypeSchema,
  type TransformType,
  // Change Types
  CSSUpdateChangeSchema,
  CSSAddChangeSchema,
  CSSRemoveChangeSchema,
  TextUpdateChangeSchema,
  TransformChangeSchema,
  type CSSUpdateChange,
  type CSSAddChange,
  type CSSRemoveChange,
  type TextUpdateChange,
  type TransformChange,
  // Request/Result Types
  TransformRequestSchema,
  TransformResultSchema,
  TransformErrorSchema,
  UndoDataSchema,
  ErrorCodes,
  ErrorCodeSchema,
  type TransformRequest,
  type TransformResult,
  type TransformError,
  type UndoData,
  type ErrorCode,
  // Type Guards
  isCSSUpdateChange,
  isCSSAddChange,
  isCSSRemoveChange,
  isTextUpdateChange,
  // Factory Functions
  createCSSUpdateChange,
  createCSSAddChange,
  createCSSRemoveChange,
  createTextUpdateChange,
  createTransformRequest,
  createTransformResult,
  createTransformError,
} from './transforms.js';
