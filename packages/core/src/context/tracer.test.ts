/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ContextTracer } from './tracer.js';
import { InMemoryFileSystem } from './system/InMemoryFileSystem.js';
import { DeterministicIdGenerator } from './system/DeterministicIdGenerator.js';

describe('ContextTracer (Fake FS & ID Gen)', () => {
  let fileSystem: InMemoryFileSystem;
  let idGenerator: DeterministicIdGenerator;

  beforeEach(() => {
    fileSystem = new InMemoryFileSystem();
    idGenerator = new DeterministicIdGenerator('mock-uuid-');
    
    // We must mock Date.now() to ensure asset file names are perfectly deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  it('initializes, logs events, and auto-saves large assets deterministically', () => {
    const tracer = new ContextTracer(
      { enabled: true, targetDir: '/fake/target', sessionId: 'test-session' },
      fileSystem,
      idGenerator
    );

    // Verify Initialization
    const initTraceLog = fileSystem.readFileSync('/fake/target/.gemini/context_trace/test-session/trace.log', 'utf8');
    expect(initTraceLog).toContain('[SYSTEM] Context Tracer Initialized');

    // Small logging: shouldn't trigger saveAsset
    tracer.logEvent('TestComponent', 'TestAction', { key: 'value' });
    
    const smallTraceLog = fileSystem.readFileSync('/fake/target/.gemini/context_trace/test-session/trace.log', 'utf8');
    expect(smallTraceLog).toContain('[TestComponent] TestAction');
    expect(smallTraceLog).toContain('{"key":"value"}');

    // Large logging: should trigger auto-asset save
    const hugeString = 'a'.repeat(2000);
    tracer.logEvent('TestComponent', 'LargeAction', { largeKey: hugeString });
    
    // 1767268800000 is 2026-01-01T12:00:00Z
    const expectedAssetPath = '/fake/target/.gemini/context_trace/test-session/assets/1767268800000-mock-uuid-1-largeKey.json';
    
    // Assert asset was written to FS
    expect(fileSystem.existsSync(expectedAssetPath)).toBe(true);
    
    const largeTraceLog = fileSystem.readFileSync('/fake/target/.gemini/context_trace/test-session/trace.log', 'utf8');
    expect(largeTraceLog).toContain('[TestComponent] LargeAction');
    expect(largeTraceLog).toContain(`{"largeKey":{"$asset":"1767268800000-mock-uuid-1-largeKey.json"}}`);
  });

  it('silently ignores logging when disabled', () => {
    const tracer = new ContextTracer(
      { enabled: false, targetDir: '/fake/target', sessionId: 'test-session' },
      fileSystem,
      idGenerator
    );

    tracer.logEvent('TestComponent', 'TestAction');
    
    const hugeString = 'a'.repeat(2000);
    tracer.logEvent('TestComponent', 'LargeAction', { largeKey: hugeString });
    
    // FS should be completely empty
    expect(fileSystem.getFiles().size).toBe(0);
  });
});
