import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { transformRegistry } from '../transforms/registry';
import { copyFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

// Import handlers to register them
import '../transforms/handlers';

const fixturesDir = join(import.meta.dir, 'fixtures/jsx');

describe('text-update handler', () => {
  let testFilePath: string;
  let originalContent: string;
  const projectDir = join(import.meta.dir, '../../..');

  beforeEach(() => {
    // Create a copy of the simple.tsx file for testing
    testFilePath = join(fixturesDir, 'text-update-test.tsx');
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

  it('is registered with the registry', () => {
    expect(transformRegistry.hasHandler('text-update')).toBe(true);
  });

  it('successfully updates text content', async () => {
    const result = await transformRegistry.execute(
      'text-update',
      {
        target: {
          file: testFilePath,
          lineNumber: 4,
          column: 7,
        },
        change: {
          originalText: 'Hello World',
          newText: 'Hello Alara',
        },
      },
      { projectDir }
    );

    expect(result.success).toBe(true);
    expect(result.affectedFiles).toContain(testFilePath);

    // Verify file was updated
    const newContent = readFileSync(testFilePath, 'utf-8');
    expect(newContent).toContain('Hello Alara');
    expect(newContent).not.toContain('Hello World');
  });

  it('returns undo data', async () => {
    const result = await transformRegistry.execute(
      'text-update',
      {
        target: {
          file: testFilePath,
          lineNumber: 4,
          column: 7,
        },
        change: {
          originalText: 'Hello World',
          newText: 'Hello Alara',
        },
      },
      { projectDir }
    );

    expect(result.success).toBe(true);
    expect(result.undoData).toBeDefined();
    expect(result.undoData?.type).toBe('text-update');
    expect(result.undoData?.revertChange).toEqual({
      originalText: 'Hello Alara',
      newText: 'Hello World',
    });
  });

  it('fails with invalid target', async () => {
    const result = await transformRegistry.execute(
      'text-update',
      {
        target: {
          file: testFilePath,
          lineNumber: 1,
          column: 1,
        },
        change: {
          originalText: 'test',
          newText: 'new',
        },
      },
      { projectDir }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('validates request schema', async () => {
    const result = await transformRegistry.execute(
      'text-update',
      {
        // Missing required fields
        target: {
          file: testFilePath,
        },
        change: {},
      },
      { projectDir }
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });
});
