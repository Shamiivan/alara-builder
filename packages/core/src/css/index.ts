// CSS Value Parser
export { parseCssValue, parseCssValues } from './parser.js';

// Color Parser
export {
  parseColor,
  colorToString,
  isColorString,
  convertColorSpace,
} from './color-parser.js';

// Serializer
export {
  toValue,
  formatNumber,
  serializeStyleValue,
  styleValuesEqual,
  type SerializeOptions,
} from './serializer.js';

// PostCSS Utilities
export {
  // CSS Parsing
  parseCSS,
  generateCSS,
  // Rule Finding
  findRule,
  findRuleAtLine,
  findAllRules,
  // Declaration Operations
  getDeclaration,
  setDeclaration,
  removeDeclaration,
  getDeclarations,
  // StyleValue Integration
  parseRuleStyles,
  setStyleValue,
  getStyleValue,
  // Rule Creation
  createRule,
  addRule,
  // Helper Functions
  normalizeSelector,
  getNodeLocation,
  getContainingAtRule,
  isInMediaQuery,
  getMediaQuery,
} from './postcss-utils.js';

// Re-export postcss types for convenience
export type { Root, Rule, Declaration, AtRule } from 'postcss';
