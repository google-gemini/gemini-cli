/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolExecutionCollector } from '../../../src/performance/collectors/tool-execution-collector.js';

describe('ToolExecutionCollector', () => {
  let collector: ToolExecutionCollector;

  beforeEach(() => {
    collector = ToolExecutionCollector.getInstance();
    collector.clear();
  });

  it('should record tool executions', () => {
    collector.recordExecution('git', 450, true);
    collector.recordExecution('npm', 1200, false, 'install', 'Network error');

    const stats = collector.getToolStats();

    expect(stats['git'].callCount).toBe(1);
    expect(stats['git'].avgTime).toBe(450);
    expect(stats['npm'].callCount).toBe(1);
    expect(stats['npm'].successRate).toBe(0);
  });

  it('should calculate statistics correctly', () => {
    collector.recordExecution('git', 400, true);
    collector.recordExecution('git', 600, true);
    collector.recordExecution('git', 500, false);

    const stats = collector.getToolStats();

    expect(stats['git'].callCount).toBe(3);
    expect(stats['git'].avgTime).toBe(500);
    expect(stats['git'].minTime).toBe(400);
    expect(stats['git'].maxTime).toBe(600);

    // safer floating comparison
    expect(stats['git'].successRate).toBeCloseTo(66.6666, 3);
  });

  it('should identify frequent tools', () => {
    collector.recordExecution('git', 100, true);
    collector.recordExecution('npm', 200, true);
    collector.recordExecution('git', 150, true);
    collector.recordExecution('docker', 300, true);
    collector.recordExecution('git', 120, true);

    const frequent = collector.getFrequentTools(2);

    expect(frequent.length).toBe(2);
    expect(frequent[0].tool).toBe('git');
    expect(frequent[0].count).toBe(3);
    expect(frequent[1].tool).toBe('npm');
  });

  it('should identify slow tools', () => {
    collector.recordExecution('git', 400, true);
    collector.recordExecution('npm', 1200, true);
    collector.recordExecution('docker', 2500, true);
    collector.recordExecution('slow-tool', 3500, true);

    const slow = collector.getSlowTools(1000);

    expect(slow.length).toBe(3);
    expect(slow[0].tool).toBe('slow-tool');
    expect(slow[0].avgTime).toBeGreaterThan(3000);
  });

  it('should calculate failure rate', () => {
    collector.recordExecution('git', 100, true);
    collector.recordExecution('git', 100, false);
    collector.recordExecution('git', 100, false);
    collector.recordExecution('npm', 100, true);

    const failureRate = collector.getFailureRate();

    expect(failureRate).toBe(50); // 2 out of 4 failed
  });
});
