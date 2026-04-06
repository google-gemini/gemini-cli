import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { ContextTracer } from './tracer.js';

vi.mock('node:fs');

describe('ContextTracer', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('initializes, logs events, and auto-saves large assets when GEMINI_CONTEXT_TRACE is true', () => {
    process.env['GEMINI_CONTEXT_TRACE'] = 'true';
    const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync');
    const appendFileSyncSpy = vi.spyOn(fs, 'appendFileSync');
    const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');

    const tracer = new ContextTracer('/fake/target', 'test-session');

    expect(mkdirSyncSpy).toHaveBeenCalled();
    
    // Small logging: shouldn't trigger saveAsset
    tracer.logEvent('TestComponent', 'TestAction', { key: 'value' });

    expect(appendFileSyncSpy).toHaveBeenCalledTimes(2); // 1 for init, 1 for TestAction
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    const logCall = appendFileSyncSpy.mock.calls[1][1] as string;
    
    expect(logCall).toContain('[TestComponent] TestAction');
    expect(logCall).toContain('{"key":"value"}');

    // Large logging: should trigger auto-asset save
    const hugeString = 'a'.repeat(2000);
    tracer.logEvent('TestComponent', 'LargeAction', { largeKey: hugeString });
    
    expect(writeFileSyncSpy).toHaveBeenCalled(); // asset saved
    
    expect(appendFileSyncSpy).toHaveBeenCalledTimes(4); // init + TestAction + the inner saveAsset log + LargeAction log
    const largeLogCall = appendFileSyncSpy.mock.calls[3][1] as string;
    expect(largeLogCall).toContain('LargeAction');
    expect(largeLogCall).toContain('"$asset":'); // verifies it was extracted
  });

  it('silently ignores logging when GEMINI_CONTEXT_TRACE is false', () => {
    process.env['GEMINI_CONTEXT_TRACE'] = 'false';
    const mkdirSyncSpy = vi.spyOn(fs, 'mkdirSync');
    const appendFileSyncSpy = vi.spyOn(fs, 'appendFileSync');
    const writeFileSyncSpy = vi.spyOn(fs, 'writeFileSync');

    const tracer = new ContextTracer('/fake/target', 'test-session');
    expect(mkdirSyncSpy).not.toHaveBeenCalled();

    tracer.logEvent('TestComponent', 'TestAction');
    expect(appendFileSyncSpy).not.toHaveBeenCalled();

    const hugeString = 'a'.repeat(2000);
    tracer.logEvent('TestComponent', 'LargeAction', { largeKey: hugeString });
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
  });
});
