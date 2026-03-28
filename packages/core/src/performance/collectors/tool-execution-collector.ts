/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseCollector } from './base-collector.js';
import type { ToolExecution } from '../types.js';

export class ToolExecutionCollector extends BaseCollector {
  private executions: ToolExecution[] = [];
  private static instance: ToolExecutionCollector;

  private constructor() {
    super(1000);
  }

  static getInstance(): ToolExecutionCollector {
    if (!ToolExecutionCollector.instance) {
      ToolExecutionCollector.instance = new ToolExecutionCollector();
    }
    return ToolExecutionCollector.instance;
  }

  recordExecution(
    toolName: string,
    duration: number,
    success: boolean,
    input?: string,
    error?: string,
  ): void {
    const execution: ToolExecution = {
      toolName,
      duration,
      success,
      timestamp: Date.now(),
      input,
      error,
    };

    this.executions.push(execution);

    this.record(duration, 'ms', {
      tool: toolName,
      success: success.toString(),
    });

    if (this.executions.length > this.maxSize) {
      this.executions = this.executions.slice(-this.maxSize);
    }

    // Auto-detect slow tools
    if (duration > 5000) {
      // eslint-disable-next-line no-console
      console.warn(
        `\x1b[33m⚠️ Slow tool execution: ${toolName} took ${duration}ms\x1b[0m`,
      );
    }
  }

  /**
   * Returns grouped stats per tool
   */
  getToolStats(): Record<
    string,
    {
      callCount: number;
      avgTime: number;
      minTime: number;
      maxTime: number;
      successRate: number;
      lastCalled: number;
    }
  > {
    const stats: Record<
      string,
      {
        callCount: number;
        totalTime: number;
        minTime: number;
        maxTime: number;
        successCount: number;
        lastCalled: number;
      }
    > = {};

    for (const exec of this.executions) {
      if (!stats[exec.toolName]) {
        stats[exec.toolName] = {
          callCount: 0,
          totalTime: 0,
          minTime: Infinity,
          maxTime: -Infinity,
          successCount: 0,
          lastCalled: 0,
        };
      }

      const stat = stats[exec.toolName];

      stat.callCount++;
      stat.totalTime += exec.duration;
      stat.minTime = Math.min(stat.minTime, exec.duration);
      stat.maxTime = Math.max(stat.maxTime, exec.duration);

      if (exec.success) stat.successCount++;

      stat.lastCalled = Math.max(stat.lastCalled, exec.timestamp);
    }

    const finalStats: Record<
      string,
      {
        callCount: number;
        avgTime: number;
        minTime: number;
        maxTime: number;
        successRate: number;
        lastCalled: number;
      }
    > = {};

    for (const tool of Object.keys(stats)) {
      const stat = stats[tool];

      finalStats[tool] = {
        callCount: stat.callCount,
        avgTime: stat.totalTime / stat.callCount,
        minTime: stat.minTime === Infinity ? 0 : stat.minTime,
        maxTime: stat.maxTime === -Infinity ? 0 : stat.maxTime,
        successRate: (stat.successCount / stat.callCount) * 100,
        lastCalled: stat.lastCalled,
      };
    }

    return finalStats;
  }

  getFrequentTools(limit: number = 5): Array<{ tool: string; count: number }> {
    const stats = this.getToolStats();

    return Object.entries(stats)
      .map(([tool, s]) => ({
        tool,
        count: s.callCount,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  getSlowTools(
    thresholdMs: number = 1000,
  ): Array<{ tool: string; avgTime: number }> {
    const stats = this.getToolStats();

    return Object.entries(stats)
      .filter(([_, s]) => s.avgTime > thresholdMs)
      .map(([tool, s]) => ({
        tool,
        avgTime: s.avgTime,
      }))
      .sort((a, b) => b.avgTime - a.avgTime);
  }

  getFailureRate(timeRangeMs = 3600000): number {
    const cutoff = Date.now() - timeRangeMs;

    const recent = this.executions.filter((e) => e.timestamp > cutoff);

    if (recent.length === 0) return 0;

    const failures = recent.filter((e) => !e.success).length;

    return (failures / recent.length) * 100;
  }

  getRecentExecutions(limit: number = 10): ToolExecution[] {
    return [...this.executions]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  override clear(): void {
    this.executions = [];
    super.clear();
  }
}
