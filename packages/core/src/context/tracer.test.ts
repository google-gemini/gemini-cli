/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextTracer } from './tracer.js';
import * as fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('node:crypto', () => {
  let count = 0;
  return {
    randomUUID: vi.fn(() => `mock-uuid-${++count}`),
  };
});

describe('ContextTracer (Real FS & Mock ID Gen)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-tracer-test-'));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('initializes, logs events, and auto-saves large assets deterministically', async () => {
    const tracer = new ContextTracer({
      enabled: true,
      targetDir: tmpDir,
      sessionId: 'test-session',
    });
    vi.advanceTimersByTime(10);
    await Promise.resolve(); // allow async mkdir to happen in constructor

    // Verify Initialization
    const traceLogPath = path.join(
      tmpDir,
      '.gemini/context_trace/test-session/trace.log',
    );
    const initTraceLog = readFileSync(traceLogPath, 'utf-8');
    expect(initTraceLog).toContain('[SYSTEM] Context Tracer Initialized');

    tracer.logEvent('TestComponent', 'TestAction', { key: 'value' });
    vi.advanceTimersByTime(10);
    await Promise.resolve();

    const smallTraceLog = readFileSync(traceLogPath, 'utf-8');
    expect(smallTraceLog).toContain('[TestComponent] TestAction');
    expect(smallTraceLog).toContain('{"key":"value"}');

    const hugeString = 'a'.repeat(2000);
    tracer.logEvent('TestComponent', 'LargeAction', { largeKey: hugeString });
    vi.advanceTimersByTime(10);
    await Promise.resolve();

    const expectedAssetPath = path.join(
      tmpDir,
      '.gemini/context_trace/test-session/assets/1767268800020-mock-uuid-1-largeKey.json',
    );
    expect(existsSync(expectedAssetPath)).toBe(true);

    const largeTraceLog = readFileSync(traceLogPath, 'utf-8');
    expect(largeTraceLog).toContain('[TestComponent] LargeAction');
    expect(largeTraceLog).toContain(
      `{"largeKey":{"$asset":"1767268800020-mock-uuid-1-largeKey.json"}}`,
    );
  });

  it('silently ignores logging when disabled', async () => {
    const tracer = new ContextTracer({
      enabled: false,
      targetDir: tmpDir,
      sessionId: 'test-session',
    });

    tracer.logEvent('TestComponent', 'TestAction');
    const hugeString = 'a'.repeat(2000);
    tracer.logEvent('TestComponent', 'LargeAction', { largeKey: hugeString });

    // Nothing should be written
    const traceDir = path.join(tmpDir, '.gemini');
    expect(existsSync(traceDir)).toBe(false);
  });
});
