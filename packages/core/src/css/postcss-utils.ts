import postcss, { Root, Rule, Declaration, AtRule, type ChildNode } from 'postcss';
import type { StyleValue } from '../shared/css-values.js';
import { parseCssValue } from './parser.js';
import { toValue } from './serializer.js';

// ============================================================================
// CSS Parsing
// ============================================================================

/**
 * Parse a CSS string into a PostCSS AST.
 *
 * @param css - CSS source string
 * @returns PostCSS Root node
 */
export function parseCSS(css: string): Root {
  return postcss.parse(css);
}

/**
 * Generate CSS string from a PostCSS AST.
 *
 * @param root - PostCSS Root node
 * @returns CSS string
 */
export function generateCSS(root: Root): string {
  return root.toString();
}

// ============================================================================
// Rule Finding
// ============================================================================

/**
 * Find a rule by selector in a PostCSS AST.
 *
 * @param root - PostCSS Root node
 * @param selector - CSS selector to find (e.g., '.button')
 * @returns Rule node or null if not found
 */
export function findRule(root: Root, selector: string): Rule | null {
  let found: Rule | null = null;

  root.walkRules((rule) => {
    if (found) return;

    // Normalize selectors for comparison
    const normalizedSelector = normalizeSelector(selector);
    const ruleSelectors = rule.selectors.map(normalizeSelector);

    if (ruleSelectors.includes(normalizedSelector)) {
      found = rule;
    }
  });

  return found;
}

/**
 * Find a rule by selector near a specific line number.
 *
 * Useful when there might be multiple rules with the same selector
 * (e.g., in media queries or at different positions in the file).
 *
 * @param root - PostCSS Root node
 * @param selector - CSS selector to find
 * @param line - Target line number (1-indexed)
 * @param tolerance - Line tolerance for matching (default: 10)
 * @returns Rule node or null if not found
 */
export function findRuleAtLine(
  root: Root,
  selector: string,
  line: number,
  tolerance: number = 10
): Rule | null {
  const normalizedSelector = normalizeSelector(selector);
  let bestMatch: Rule | null = null;
  let bestDistance = Infinity;

  root.walkRules((rule) => {
    const ruleSelectors = rule.selectors.map(normalizeSelector);

    if (ruleSelectors.includes(normalizedSelector)) {
      const ruleLine = rule.source?.start?.line ?? 0;
      const distance = Math.abs(ruleLine - line);

      if (distance < bestDistance && distance <= tolerance) {
        bestDistance = distance;
        bestMatch = rule;
      }
    }
  });

  return bestMatch;
}

/**
 * Find all rules matching a selector.
 *
 * @param root - PostCSS Root node
 * @param selector - CSS selector to find
 * @returns Array of matching Rule nodes
 */
export function findAllRules(root: Root, selector: string): Rule[] {
  const normalizedSelector = normalizeSelector(selector);
  const rules: Rule[] = [];

  root.walkRules((rule) => {
    const ruleSelectors = rule.selectors.map(normalizeSelector);

    if (ruleSelectors.includes(normalizedSelector)) {
      rules.push(rule);
    }
  });

  return rules;
}

// ============================================================================
// Declaration Operations
// ============================================================================

/**
 * Get a declaration by property name from a rule.
 *
 * @param rule - PostCSS Rule node
 * @param property - CSS property name
 * @returns Declaration node or null if not found
 */
export function getDeclaration(rule: Rule, property: string): Declaration | null {
  const normalizedProp = property.toLowerCase();

  for (const node of rule.nodes ?? []) {
    if (node.type === 'decl' && node.prop.toLowerCase() === normalizedProp) {
      return node;
    }
  }

  return null;
}

/**
 * Set a declaration value in a rule.
 *
 * If the declaration exists, updates its value.
 * If it doesn't exist, adds a new declaration.
 *
 * @param rule - PostCSS Rule node
 * @param property - CSS property name
 * @param value - CSS value string
 * @returns The created or updated Declaration node
 */
export function setDeclaration(rule: Rule, property: string, value: string): Declaration {
  const existing = getDeclaration(rule, property);

  if (existing) {
    existing.value = value;
    return existing;
  }

  // Create new declaration
  const decl = postcss.decl({ prop: property, value });
  rule.append(decl);
  return decl;
}

/**
 * Remove a declaration from a rule.
 *
 * @param rule - PostCSS Rule node
 * @param property - CSS property name
 * @returns true if declaration was found and removed
 */
export function removeDeclaration(rule: Rule, property: string): boolean {
  const decl = getDeclaration(rule, property);

  if (decl) {
    decl.remove();
    return true;
  }

  return false;
}

/**
 * Get all declarations from a rule as a Map.
 *
 * @param rule - PostCSS Rule node
 * @returns Map of property name to value string
 */
export function getDeclarations(rule: Rule): Map<string, string> {
  const decls = new Map<string, string>();

  for (const node of rule.nodes ?? []) {
    if (node.type === 'decl') {
      decls.set(node.prop, node.value);
    }
  }

  return decls;
}

// ============================================================================
// StyleValue Integration
// ============================================================================

/**
 * Parse all declarations in a rule into StyleValues.
 *
 * @param rule - PostCSS Rule node
 * @returns Map of property name to StyleValue
 */
export function parseRuleStyles(rule: Rule): Map<string, StyleValue> {
  const styles = new Map<string, StyleValue>();

  for (const node of rule.nodes ?? []) {
    if (node.type === 'decl') {
      const styleValue = parseCssValue(node.prop, node.value);
      styles.set(node.prop, styleValue);
    }
  }

  return styles;
}

/**
 * Set a declaration value using a StyleValue.
 *
 * @param rule - PostCSS Rule node
 * @param property - CSS property name
 * @param value - StyleValue to set
 * @returns The created or updated Declaration node
 */
export function setStyleValue(rule: Rule, property: string, value: StyleValue): Declaration {
  return setDeclaration(rule, property, toValue(value));
}

/**
 * Get a declaration value as a StyleValue.
 *
 * @param rule - PostCSS Rule node
 * @param property - CSS property name
 * @returns StyleValue or null if declaration not found
 */
export function getStyleValue(rule: Rule, property: string): StyleValue | null {
  const decl = getDeclaration(rule, property);

  if (decl) {
    return parseCssValue(property, decl.value);
  }

  return null;
}

// ============================================================================
// Rule Creation
// ============================================================================

/**
 * Create a new rule with the given selector and declarations.
 *
 * @param selector - CSS selector
 * @param declarations - Map or object of property-value pairs
 * @returns New Rule node
 */
export function createRule(
  selector: string,
  declarations: Map<string, string> | Record<string, string>
): Rule {
  const rule = postcss.rule({ selector });

  const entries =
    declarations instanceof Map ? declarations.entries() : Object.entries(declarations);

  for (const [prop, value] of entries) {
    rule.append(postcss.decl({ prop, value }));
  }

  return rule;
}

/**
 * Add a new rule to a stylesheet.
 *
 * @param root - PostCSS Root node
 * @param selector - CSS selector
 * @param declarations - Map or object of property-value pairs
 * @returns The created Rule node
 */
export function addRule(
  root: Root,
  selector: string,
  declarations: Map<string, string> | Record<string, string>
): Rule {
  const rule = createRule(selector, declarations);
  root.append(rule);
  return rule;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize a CSS selector for comparison.
 *
 * - Trims whitespace
 * - Collapses internal whitespace
 * - Lowercases (for case-insensitive comparison)
 *
 * @param selector - CSS selector string
 * @returns Normalized selector
 */
export function normalizeSelector(selector: string): string {
  return selector.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Get the source location of a node.
 *
 * @param node - PostCSS node
 * @returns Location object or null
 */
export function getNodeLocation(
  node: ChildNode | Root
): { line: number; column: number } | null {
  const start = node.source?.start;

  if (start) {
    return { line: start.line, column: start.column };
  }

  return null;
}

/**
 * Find the at-rule containing a rule (e.g., @media).
 *
 * @param rule - PostCSS Rule node
 * @returns Parent AtRule or null
 */
export function getContainingAtRule(rule: Rule): AtRule | null {
  const parent = rule.parent;

  if (parent && parent.type === 'atrule') {
    return parent as AtRule;
  }

  return null;
}

/**
 * Check if a rule is inside a media query.
 *
 * @param rule - PostCSS Rule node
 * @returns true if rule is inside @media
 */
export function isInMediaQuery(rule: Rule): boolean {
  const atRule = getContainingAtRule(rule);
  return atRule?.name === 'media';
}

/**
 * Get the media query condition for a rule.
 *
 * @param rule - PostCSS Rule node
 * @returns Media query string or null
 */
export function getMediaQuery(rule: Rule): string | null {
  const atRule = getContainingAtRule(rule);

  if (atRule?.name === 'media') {
    return atRule.params;
  }

  return null;
}
