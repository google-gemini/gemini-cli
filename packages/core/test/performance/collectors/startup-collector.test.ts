/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StartupCollector } from '../../../src/performance/collectors/startup-collector.js';

describe('StartupCollector', () => {
  let collector: StartupCollector;

  beforeEach(() => {
    collector = StartupCollector.getInstance();
    collector.reset();
  });

  afterEach(() => {
    collector.reset();
  });

  it('should record startup phases', async () => {
    collector.markStart('test-phase');
    await new Promise((resolve) => setTimeout(resolve, 10));
    collector.markEnd('test-phase');

    const phases = collector.getPhases();
    expect(phases.length).toBe(1);
    expect(phases[0].name).toBe('test-phase');
    expect(phases[0].duration).toBeGreaterThan(0);
  });

  it('should calculate total startup time', async () => {
    collector.markStart('phase1');
    await new Promise((resolve) => setTimeout(resolve, 10));
    collector.markEnd('phase1');

    collector.markStart('phase2');
    await new Promise((resolve) => setTimeout(resolve, 20));
    collector.markEnd('phase2');

    const total = collector.getTotalTime();
    expect(total).toBeGreaterThan(30);
  });

  it('should provide optimization suggestions for slow phases', async () => {
    collector.markStart('module-loading');
    await new Promise((resolve) => setTimeout(resolve, 600)); // >500ms
    collector.markEnd('module-loading');

    const suggestions = collector.getOptimizationSuggestions();
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toContain('dynamic imports');
  });

  it('should measure async functions', async () => {
    const result = await collector.measureAsync('async-test', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'success';
    });

    expect(result).toBe('success');
    const phases = collector.getPhases();
    expect(phases[0].name).toBe('async-test');
    expect(phases[0].duration).toBeGreaterThan(0);
  });

  it('should measure sync functions', () => {
    const result = collector.measureSync('sync-test', () => {
      let sum = 0;
      for (let i = 0; i < 1000000; i++) sum += i;
      return sum;
    });

    expect(result).toBeGreaterThan(0);
    const phases = collector.getPhases();
    expect(phases[0].name).toBe('sync-test');
    expect(phases[0].duration).toBeGreaterThan(0);
  });
});
