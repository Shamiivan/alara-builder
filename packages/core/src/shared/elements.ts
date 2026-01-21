import { z } from 'zod';

// ============================================================================
// ElementTarget - Parsed element identification from DOM attributes
// ============================================================================

/**
 * ElementTarget identifies an element for editing.
 * Data is extracted directly from DOM attributes injected at build time.
 *
 * DOM attributes:
 *   oid="src/components/Button.tsx:12:4"     -> file, lineNumber, column
 *   css="src/components/Button.module.css:.button .primary" -> cssFile, selectors
 *
 * No registry needed - attributes are self-contained.
 */
export const ElementTargetSchema = z.object({
  /** TSX file path */
  file: z.string(),
  /** 1-indexed line number */
  lineNumber: z.number().int().positive(),
  /** 1-indexed column number */
  column: z.number().int().positive(),
  /** CSS Module file path */
  cssFile: z.string(),
  /** CSS selectors (e.g., ['.button', '.primary']) */
  selectors: z.array(z.string()),
});

export type ElementTarget = z.infer<typeof ElementTargetSchema>;

// ============================================================================
// DOM Attribute Parsing
// ============================================================================

/**
 * Parse the oid attribute from a DOM element.
 * Format: "src/components/Button.tsx:12:4"
 *
 * @param oid - The oid attribute value
 * @returns Parsed object with file, lineNumber, column or null if invalid
 */
export function parseOid(oid: string): { file: string; lineNumber: number; column: number } | null {
  if (!oid) return null;

  // Split by ':' and extract from the end (handles Windows paths like C:\path)
  const parts = oid.split(':');
  if (parts.length < 3) return null;

  const column = parseInt(parts.pop()!, 10);
  const lineNumber = parseInt(parts.pop()!, 10);
  const file = parts.join(':'); // Rejoin for Windows paths

  if (isNaN(column) || isNaN(lineNumber) || !file) return null;

  return { file, lineNumber, column };
}

/**
 * Parse the css attribute from a DOM element.
 * Format: "src/components/Button.module.css:.button .primary"
 *
 * @param css - The css attribute value
 * @returns Parsed object with cssFile, selectors or null if invalid
 */
export function parseCssAttribute(css: string): { cssFile: string; selectors: string[] } | null {
  if (!css) return null;

  // Find the first ':.' which marks the start of selectors
  const colonIndex = css.indexOf(':.');
  if (colonIndex === -1) return null;

  const cssFile = css.slice(0, colonIndex);
  const selectorsStr = css.slice(colonIndex + 1); // Include the leading '.'

  if (!cssFile || !selectorsStr) return null;

  // Split selectors by space (e.g., ".button .primary" -> [".button", ".primary"])
  const selectors = selectorsStr.split(' ').filter(Boolean);

  return { cssFile, selectors };
}

/**
 * Parse both oid and css attributes to create an ElementTarget.
 *
 * @param oid - The oid attribute (e.g., "src/Button.tsx:12:4")
 * @param css - The css attribute (e.g., "src/Button.module.css:.button .primary")
 * @returns ElementTarget or null if parsing fails
 */
export function parseElementTarget(oid: string, css: string): ElementTarget | null {
  const oidParsed = parseOid(oid);
  const cssParsed = parseCssAttribute(css);

  if (!oidParsed || !cssParsed) return null;

  return {
    file: oidParsed.file,
    lineNumber: oidParsed.lineNumber,
    column: oidParsed.column,
    cssFile: cssParsed.cssFile,
    selectors: cssParsed.selectors,
  };
}

/**
 * Get ElementTarget from a DOM element by reading its oid and css attributes.
 *
 * @param element - DOM element with oid and css attributes
 * @returns ElementTarget or null if attributes are missing/invalid
 */
export function getElementTarget(element: Element): ElementTarget | null {
  const oid = element.getAttribute('oid');
  const css = element.getAttribute('css');

  if (!oid || !css) return null;

  return parseElementTarget(oid, css);
}

/**
 * Find the closest editable element (with oid and css attributes) from a target element.
 *
 * @param element - Starting element to search from
 * @returns The closest editable element or null
 */
export function findEditableElement(element: Element): Element | null {
  return element.closest('[oid][css]');
}
