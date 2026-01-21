/**
 * Phase 0.5 - Integration Smoke Test
 * Verifies: CLI starts server → client connects → message round-trips
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createServer } from '../server';

const TEST_PORT = 4001;
let server: ReturnType<typeof createServer>;

beforeAll(() => {
  server = createServer({ port: TEST_PORT, projectDir: process.cwd() });
});

afterAll(() => {
  server.stop();
});

describe('Phase 0 Integration', () => {
  test('server starts and accepts connections', async () => {
    const response = await fetch(`http://localhost:${TEST_PORT}/health`);
    const data = await response.json();

    expect(response.ok).toBe(true);
    expect(data.status).toBe('ok');
  });

  test('WebSocket connects and receives "connected" message', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

    const message = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (e) => resolve(e.data);
      ws.onerror = reject;
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });

    const parsed = JSON.parse(message);
    expect(parsed.type).toBe('connected');

    ws.close();
  });

  test('ping/pong round-trip works', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

    // Wait for connection
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    // Skip "connected" message
    await new Promise<void>((resolve) => {
      ws.onmessage = () => resolve();
    });

    // Send ping
    const pingId = 'test-ping-123';
    ws.send(JSON.stringify({ action: 'ping', id: pingId }));

    // Wait for pong
    const pong = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (e) => resolve(e.data);
      ws.onerror = reject;
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });

    const parsed = JSON.parse(pong);
    expect(parsed.type).toBe('pong');
    expect(parsed.requestId).toBe(pingId);

    ws.close();
  });

  test('echo mode returns messages back', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    // Skip "connected" message
    await new Promise<void>((resolve) => {
      ws.onmessage = () => resolve();
    });

    // Send test message
    const testMsg = { action: 'transform', id: 'echo-test', data: 'hello' };
    ws.send(JSON.stringify(testMsg));

    // Wait for echo
    const echo = await new Promise<string>((resolve, reject) => {
      ws.onmessage = (e) => resolve(e.data);
      ws.onerror = reject;
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });

    const parsed = JSON.parse(echo);
    expect(parsed.action).toBe('transform');
    expect(parsed.id).toBe('echo-test');
    expect(parsed.data).toBe('hello');

    ws.close();
  });
});
