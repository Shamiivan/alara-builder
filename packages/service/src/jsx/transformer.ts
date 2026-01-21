import { Project, SourceFile, SyntaxKind, Node, JsxElement, JsxSelfClosingElement, JsxText } from 'ts-morph';

export interface JSXTransformResult {
  success: boolean;
  error?: string;
  newContent?: string;
}

export interface ElementLocation {
  line: number;
  column: number;
}

/**
 * JSXTransformer provides utilities for finding and modifying JSX elements in TypeScript/JSX files.
 * Uses ts-morph for AST manipulation.
 */
export class JSXTransformer {
  private project: Project;

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: false,
      skipFileDependencyResolution: true,
      compilerOptions: {
        jsx: 2, // JsxEmit.React
        allowJs: true,
      },
    });
  }

  /**
   * Get or create a source file for the given path.
   * Reloads the file from disk if it was previously loaded.
   */
  private getSourceFile(filePath: string): SourceFile {
    let sourceFile = this.project.getSourceFile(filePath);

    if (sourceFile) {
      // Refresh from disk to get latest content
      sourceFile.refreshFromFileSystemSync();
    } else {
      sourceFile = this.project.addSourceFileAtPath(filePath);
    }

    return sourceFile;
  }

  /**
   * Convert 1-indexed line/column to a position in the source file.
   */
  private lineColumnToPos(sourceFile: SourceFile, line: number, column: number): number {
    const text = sourceFile.getFullText();
    const lines = text.split('\n');

    let pos = 0;
    for (let i = 0; i < line - 1; i++) {
      pos += lines[i].length + 1; // +1 for newline
    }

    return pos + column - 1; // column is 1-indexed
  }

  /**
   * Find the JSX element that starts at the given line and column.
   * Returns the JsxElement or JsxSelfClosingElement at that position.
   */
  findElementAt(
    filePath: string,
    line: number,
    column: number
  ): JsxElement | JsxSelfClosingElement | null {
    const sourceFile = this.getSourceFile(filePath);
    const pos = this.lineColumnToPos(sourceFile, line, column);

    // Find the node at this position
    const nodeAtPos = sourceFile.getDescendantAtPos(pos);
    if (!nodeAtPos) {
      return null;
    }

    // Walk up to find the JSX element
    let current: Node | undefined = nodeAtPos;
    while (current) {
      if (current.getKind() === SyntaxKind.JsxElement) {
        return current as JsxElement;
      }
      if (current.getKind() === SyntaxKind.JsxSelfClosingElement) {
        return current as JsxSelfClosingElement;
      }
      if (current.getKind() === SyntaxKind.JsxOpeningElement) {
        // Get the parent JsxElement
        const parent = current.getParent();
        if (parent && parent.getKind() === SyntaxKind.JsxElement) {
          return parent as JsxElement;
        }
      }
      current = current.getParent();
    }

    return null;
  }

  /**
   * Find all text nodes within a JSX element.
   */
  private findTextNodes(element: JsxElement | JsxSelfClosingElement): JsxText[] {
    if (element.getKind() === SyntaxKind.JsxSelfClosingElement) {
      return []; // Self-closing elements have no text content
    }

    const jsxElement = element as JsxElement;
    return jsxElement.getDescendantsOfKind(SyntaxKind.JsxText);
  }

  /**
   * Get the combined text content of a JSX element.
   * Only includes direct JsxText children, not text in nested elements.
   */
  getTextContent(element: JsxElement | JsxSelfClosingElement): string {
    if (element.getKind() === SyntaxKind.JsxSelfClosingElement) {
      return '';
    }

    const jsxElement = element as JsxElement;
    const children = jsxElement.getJsxChildren();

    let text = '';
    for (const child of children) {
      if (child.getKind() === SyntaxKind.JsxText) {
        text += (child as JsxText).getText();
      }
    }

    return text;
  }

  /**
   * Update the text content of a JSX element.
   *
   * @param filePath - Path to the TSX/JSX file
   * @param line - 1-indexed line number where the element starts
   * @param column - 1-indexed column number where the element starts
   * @param originalText - The original text to verify (optional, for safety)
   * @param newText - The new text content
   * @returns Result indicating success/failure and the new file content
   */
  updateTextContent(
    filePath: string,
    line: number,
    column: number,
    originalText: string,
    newText: string
  ): JSXTransformResult {
    try {
      const element = this.findElementAt(filePath, line, column);

      if (!element) {
        return {
          success: false,
          error: `No JSX element found at ${filePath}:${line}:${column}`,
        };
      }

      if (element.getKind() === SyntaxKind.JsxSelfClosingElement) {
        return {
          success: false,
          error: 'Cannot update text content of self-closing element',
        };
      }

      const jsxElement = element as JsxElement;
      const children = jsxElement.getJsxChildren();

      // Find the JsxText child that contains text
      let textNode: JsxText | null = null;
      for (const child of children) {
        if (child.getKind() === SyntaxKind.JsxText) {
          const childText = child as JsxText;
          const text = childText.getText().trim();
          if (text) {
            textNode = childText;
            break;
          }
        }
      }

      // Verify original text if provided
      if (originalText) {
        const currentText = textNode ? textNode.getText().trim() : '';
        if (currentText !== originalText.trim()) {
          return {
            success: false,
            error: `Text content mismatch. Expected "${originalText}", found "${currentText}"`,
          };
        }
      }

      // Get the source file from the element (it's already loaded)
      const sourceFile = element.getSourceFile();

      if (textNode) {
        // Replace existing text node
        textNode.replaceWithText(newText);
      } else {
        // No text node found, we need to insert text
        // This handles elements like <span></span> that have no text yet
        const openingElement = jsxElement.getOpeningElement();
        const closingElement = jsxElement.getClosingElement();

        // Get the position right after the opening tag
        const insertPos = openingElement.getEnd();
        const deleteEnd = closingElement.getStart();

        // Replace everything between opening and closing tags
        sourceFile.replaceText([insertPos, deleteEnd], newText);
      }

      // Get the updated content (before saving)
      const newContent = sourceFile.getFullText();

      // Save to disk
      sourceFile.saveSync();

      return {
        success: true,
        newContent,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get the file content without making any changes.
   * Useful for previewing or reading the current state.
   */
  getFileContent(filePath: string): string {
    const sourceFile = this.getSourceFile(filePath);
    return sourceFile.getFullText();
  }

  /**
   * Clear the cached source files.
   * Call this if files have been modified externally.
   */
  clearCache(): void {
    for (const sourceFile of this.project.getSourceFiles()) {
      this.project.removeSourceFile(sourceFile);
    }
  }
}

// Singleton instance for convenience
let transformerInstance: JSXTransformer | null = null;

export function getJSXTransformer(): JSXTransformer {
  if (!transformerInstance) {
    transformerInstance = new JSXTransformer();
  }
  return transformerInstance;
}
