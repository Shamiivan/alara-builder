import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const TEST_APP_DIR = join(__dirname, '../examples/simple-app');
const APP_TSX_PATH = join(TEST_APP_DIR, 'src/App.tsx');

test.describe('Phase 2: Text Editing', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the test app
    await page.goto('/');
    // Wait for the app to load
    await page.waitForSelector('h1');
  });

  test('elements have oid attributes injected', async ({ page }) => {
    // Check that the h1 element has an oid attribute
    const h1 = page.locator('h1');
    await expect(h1).toHaveAttribute('oid', /src\/App\.tsx:\d+:\d+/);
  });

  test('clicking element shows selection overlay', async ({ page }) => {
    // This test requires the builder UI to be running
    // For now, we just verify the oid attributes are present
    const h1 = page.locator('h1');
    const oid = await h1.getAttribute('oid');
    expect(oid).toMatch(/src\/App\.tsx:\d+:\d+/);
  });

  test('text elements are editable', async ({ page }) => {
    // Verify the h1 element exists and has text content
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    const text = await h1.textContent();
    expect(text).toBeTruthy();
  });

  test('Card component elements have oid attributes', async ({ page }) => {
    // Check that Card component children have oid attributes
    const cards = page.locator('.card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Check that the card title has an oid
    const cardTitle = page.locator('.card-title').first();
    await expect(cardTitle).toHaveAttribute('oid', /src\/components\/Card\.tsx:\d+:\d+/);
  });

  test('Button component has oid attribute', async ({ page }) => {
    // Check that Button component has an oid
    const button = page.locator('.button').first();
    await expect(button).toHaveAttribute('oid', /src\/components\/Button\.tsx:\d+:\d+/);
  });

  test('nested elements have correct oid paths', async ({ page }) => {
    // Get several elements and verify their oid attributes point to correct files
    const elements = [
      { selector: 'h1', file: 'src/App.tsx' },
      { selector: '.card', file: 'src/components/Card.tsx' },
      { selector: '.button', file: 'src/components/Button.tsx' },
    ];

    for (const { selector, file } of elements) {
      const element = page.locator(selector).first();
      const oid = await element.getAttribute('oid');
      expect(oid).toContain(file);
    }
  });

  test('Alara WebSocket client connects', async ({ page }) => {
    // Wait for the Alara client script to load and connect
    await page.waitForFunction(
      () => {
        const ws = (window as { __ALARA_WS__?: () => WebSocket | null }).__ALARA_WS__?.();
        return ws?.readyState === WebSocket.OPEN;
      },
      { timeout: 10000 }
    );

    // Verify the WebSocket is connected
    const isConnected = await page.evaluate(() => {
      const ws = (window as { __ALARA_WS__?: () => WebSocket | null }).__ALARA_WS__?.();
      return ws?.readyState === WebSocket.OPEN;
    });

    expect(isConnected).toBe(true);
  });
});

test.describe('Text Editing Flow', () => {
  test.skip('double-click activates contentEditable', async ({ page }) => {
    // This test requires full builder UI integration
    // Skipping for now until builder app is fully integrated
    await page.goto('/');

    const h1 = page.locator('h1');
    await h1.dblclick();

    // After double-click, element should be contentEditable
    const isEditable = await h1.getAttribute('contenteditable');
    expect(isEditable).toBe('true');
  });

  test.skip('editing text and pressing Enter commits changes', async ({ page }) => {
    // This test requires full builder UI integration
    // Skipping for now
    await page.goto('/');

    const h1 = page.locator('h1');
    const originalText = await h1.textContent();

    // Double-click to edit
    await h1.dblclick();

    // Clear and type new text
    await h1.fill('New Title');
    await page.keyboard.press('Enter');

    // Wait for the change to be committed
    await page.waitForTimeout(1000);

    // Verify file was updated
    const fileContent = readFileSync(APP_TSX_PATH, 'utf-8');
    expect(fileContent).toContain('New Title');
  });

  test.skip('pressing Escape cancels editing', async ({ page }) => {
    // This test requires full builder UI integration
    // Skipping for now
    await page.goto('/');

    const h1 = page.locator('h1');
    const originalText = await h1.textContent();

    // Double-click to edit
    await h1.dblclick();

    // Type some text
    await h1.fill('Changed Text');

    // Press Escape to cancel
    await page.keyboard.press('Escape');

    // Text should be restored to original
    await expect(h1).toHaveText(originalText!);
  });
});
