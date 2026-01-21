import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { JSXTransformer } from '../jsx/transformer.js';
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const fixturesDir = join(import.meta.dir, 'fixtures/jsx');

describe('JSXTransformer', () => {
  let transformer: JSXTransformer;
  let testFilePath: string;
  let originalContent: string;

  beforeEach(() => {
    transformer = new JSXTransformer();
    // Create a copy of the simple.tsx file for testing
    testFilePath = join(fixturesDir, 'test-temp.tsx');
    copyFileSync(join(fixturesDir, 'simple.tsx'), testFilePath);
    originalContent = readFileSync(testFilePath, 'utf-8');
  });

  afterEach(() => {
    // Clean up test file
    try {
      unlinkSync(testFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('findElementAt', () => {
    it('finds a JSX element at the given position', () => {
      // h1 is at line 4, column 7
      const element = transformer.findElementAt(testFilePath, 4, 7);
      expect(element).not.toBeNull();
      expect(element?.getText()).toBe('<h1>Hello World</h1>');
    });

    it('finds nested elements', () => {
      // div is at line 3, column 5
      const element = transformer.findElementAt(testFilePath, 3, 5);
      expect(element).not.toBeNull();
      expect(element?.getText()).toContain('<div>');
      expect(element?.getText()).toContain('</div>');
    });

    it('returns null for invalid positions', () => {
      const element = transformer.findElementAt(testFilePath, 1, 1);
      expect(element).toBeNull();
    });

    it('finds the p element', () => {
      // p is at line 5, column 7
      const element = transformer.findElementAt(testFilePath, 5, 7);
      expect(element).not.toBeNull();
      expect(element?.getText()).toBe('<p>This is a paragraph</p>');
    });
  });

  describe('getTextContent', () => {
    it('gets text content from an element', () => {
      const element = transformer.findElementAt(testFilePath, 4, 7);
      expect(element).not.toBeNull();
      const text = transformer.getTextContent(element!);
      expect(text).toBe('Hello World');
    });

    it('gets text content from paragraph', () => {
      const element = transformer.findElementAt(testFilePath, 5, 7);
      expect(element).not.toBeNull();
      const text = transformer.getTextContent(element!);
      expect(text).toBe('This is a paragraph');
    });
  });

  describe('updateTextContent', () => {
    it('updates text content of an element', () => {
      // Update h1 text
      const result = transformer.updateTextContent(
        testFilePath,
        4,
        7,
        'Hello World',
        'Hello Alara'
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain('Hello Alara');
      expect(result.newContent).not.toContain('Hello World');

      // Verify file was actually saved
      const fileContent = readFileSync(testFilePath, 'utf-8');
      expect(fileContent).toContain('Hello Alara');
    });

    it('fails with text mismatch', () => {
      const result = transformer.updateTextContent(
        testFilePath,
        4,
        7,
        'Wrong Text',
        'New Text'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('mismatch');
    });

    it('fails for invalid position', () => {
      const result = transformer.updateTextContent(
        testFilePath,
        1,
        1,
        'test',
        'new'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No JSX element found');
    });

    it('updates without original text verification', () => {
      const result = transformer.updateTextContent(
        testFilePath,
        4,
        7,
        '', // Empty original text skips verification
        'Updated Text'
      );

      expect(result.success).toBe(true);
      expect(result.newContent).toContain('Updated Text');
    });
  });

  describe('clearCache', () => {
    it('clears cached source files', () => {
      // First access creates cache
      transformer.findElementAt(testFilePath, 4, 7);

      // Modify file externally
      writeFileSync(testFilePath, originalContent.replace('Hello World', 'External Change'));

      // Without clearing cache, would still see old content
      transformer.clearCache();

      // After clearing, should see new content
      const element = transformer.findElementAt(testFilePath, 4, 7);
      expect(element?.getText()).toContain('External Change');
    });
  });
});
