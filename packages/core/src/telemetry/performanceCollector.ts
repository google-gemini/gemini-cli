/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import v8 from 'node:v8';

/**
 * Per-model latency percentile breakdown.
 */
export interface ModelLatency {
  model: string;
  p50: number;
  p90: number;
  p99: number;
  sampleCount: number;
}

/**
 * Token efficiency metrics across a session.
 */
export interface TokenEfficiency {
  cacheHitRate: number;
  outputEfficiency: number;
  contextUtilization: number;
  totalInput: number;
  totalOutput: number;
  totalCached: number;
}

/**
 * Memory trend data point.
 */
export interface MemoryDataPoint {
  timestamp: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
}

/**
 * Startup phase breakdown.
 */
export interface StartupPhase {
  name: string;
  durationMs: number;
  percentage: number;
}

/**
 * An actionable optimization suggestion.
 */
export interface OptimizationSuggestion {
  severity: 'info' | 'warning' | 'critical';
  category: string;
  message: string;
}

/**
 * Complete performance summary aggregated from all telemetry sources.
 */
export interface PerformanceSummary {
  sessionDurationMs: number;
  apiWaitMs: number;
  toolExecMs: number;
  latencyByModel: ModelLatency[];
  tokenEfficiency: TokenEfficiency;
  memoryTrend: MemoryDataPoint[];
  memoryPeakMB: number;
  memoryCurrentMB: number;
  heapUtilization: number;
  startupPhases: StartupPhase[];
  startupTotalMs: number;
  suggestions: OptimizationSuggestion[];
}

/**
 * Aggregates performance data from existing telemetry services
 * (UiTelemetryService, MemoryMonitor, StartupProfiler) into a unified
 * PerformanceSummary with latency percentiles, token efficiency,
 * memory trends, and optimization suggestions.
 *
 * Maintains rolling latency buffers for P50/P90/P99 computation since
 * UiTelemetryService only stores aggregate totals.
 */
export class PerformanceCollector {
  private latencyBuffers: Map<string, number[]> = new Map();
  private memorySnapshots: MemoryDataPoint[] = [];
  private startupPhases: StartupPhase[] = [];
  private startupTotalMs = 0;
  private sessionStartTime = Date.now();
  private readonly maxBufferSize: number;

  constructor(maxBufferSize = 1000) {
    this.maxBufferSize = maxBufferSize;
  }

  /**
   * Records an API call latency for a specific model.
   */
  recordLatency(model: string, durationMs: number): void {
    let buffer = this.latencyBuffers.get(model);
    if (!buffer) {
      buffer = [];
      this.latencyBuffers.set(model, buffer);
    }
    buffer.push(durationMs);
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }
  }

  /**
   * Records a memory snapshot at the current point in time.
   */
  recordMemorySnapshot(): void {
    const mem = process.memoryUsage();
    this.memorySnapshots.push({
      timestamp: Date.now(),
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      rssMB: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
    });
  }

  /**
   * Records startup phase timing data.
   */
  recordStartupPhase(name: string, durationMs: number): void {
    this.startupPhases.push({ name, durationMs, percentage: 0 });
    this.startupTotalMs = this.startupPhases.reduce(
      (sum, p) => sum + p.durationMs,
      0,
    );
    // Recompute percentages
    for (const phase of this.startupPhases) {
      phase.percentage =
        this.startupTotalMs > 0
          ? (phase.durationMs / this.startupTotalMs) * 100
          : 0;
    }
  }

  /**
   * Computes the given percentile of a set of values.
   * Uses the nearest-rank method.
   */
  computePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Computes token efficiency from session metrics.
   */
  computeTokenEfficiency(metrics: {
    totalInput: number;
    totalOutput: number;
    totalCached: number;
    contextLimit?: number;
  }): TokenEfficiency {
    const { totalInput, totalOutput, totalCached, contextLimit } = metrics;
    return {
      cacheHitRate: totalInput > 0 ? totalCached / totalInput : 0,
      outputEfficiency:
        totalInput > 0 ? totalOutput / (totalInput + totalOutput) : 0,
      contextUtilization:
        contextLimit && contextLimit > 0 ? totalInput / contextLimit : 0,
      totalInput,
      totalOutput,
      totalCached,
    };
  }

  /**
   * Generates optimization suggestions based on current metrics.
   */
  generateSuggestions(metrics: {
    tokenEfficiency: TokenEfficiency;
    toolStats?: Array<{
      name: string;
      avgDurationMs: number;
      failRate: number;
    }>;
    memoryPeakMB?: number;
    heapUtilization?: number;
  }): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const { tokenEfficiency, toolStats, heapUtilization } = metrics;

    // Low cache hit rate
    if (
      tokenEfficiency.totalInput > 100 &&
      tokenEfficiency.cacheHitRate < 0.3
    ) {
      suggestions.push({
        severity: 'warning',
        category: 'tokens',
        message: `Low cache hit rate (${(tokenEfficiency.cacheHitRate * 100).toFixed(1)}%). Consider structuring prompts for better caching.`,
      });
    }

    // High context utilization
    if (tokenEfficiency.contextUtilization > 0.8) {
      suggestions.push({
        severity: 'warning',
        category: 'context',
        message: `High context window usage (${(tokenEfficiency.contextUtilization * 100).toFixed(0)}%). Risk of context overflow.`,
      });
    }

    // Slow tools
    if (toolStats) {
      for (const tool of toolStats) {
        if (tool.avgDurationMs > 5000) {
          suggestions.push({
            severity: 'warning',
            category: 'tools',
            message: `Tool \`${tool.name}\` is slow (avg ${(tool.avgDurationMs / 1000).toFixed(1)}s). Check for large file reads or network calls.`,
          });
        }
        if (tool.failRate > 0.3) {
          suggestions.push({
            severity: 'warning',
            category: 'tools',
            message: `Tool \`${tool.name}\` has high failure rate (${(tool.failRate * 100).toFixed(0)}%). Investigate errors.`,
          });
        }
      }
    }

    // Memory pressure (using v8 heap limit)
    if (heapUtilization && heapUtilization > 0.85) {
      suggestions.push({
        severity: 'critical',
        category: 'memory',
        message: `High heap utilization (${(heapUtilization * 100).toFixed(0)}% of heap limit). Risk of heap exhaustion crash.`,
      });
    } else if (heapUtilization && heapUtilization > 0.6) {
      suggestions.push({
        severity: 'warning',
        category: 'memory',
        message: `Elevated memory usage (${(heapUtilization * 100).toFixed(0)}% of heap limit). Consider shorter sessions.`,
      });
    }

    return suggestions;
  }

  /**
   * Builds a complete PerformanceSummary from current data and session metrics.
   */
  buildSummary(sessionMetrics: {
    totalApiWaitMs: number;
    totalToolExecMs: number;
    totalInput: number;
    totalOutput: number;
    totalCached: number;
    contextLimit?: number;
    toolStats?: Array<{
      name: string;
      avgDurationMs: number;
      failRate: number;
    }>;
  }): PerformanceSummary {
    const now = Date.now();
    const sessionDurationMs = now - this.sessionStartTime;

    // Latency percentiles per model
    const latencyByModel: ModelLatency[] = [];
    for (const [model, buffer] of this.latencyBuffers.entries()) {
      latencyByModel.push({
        model,
        p50: this.computePercentile(buffer, 50),
        p90: this.computePercentile(buffer, 90),
        p99: this.computePercentile(buffer, 99),
        sampleCount: buffer.length,
      });
    }

    // Token efficiency
    const tokenEfficiency = this.computeTokenEfficiency({
      totalInput: sessionMetrics.totalInput,
      totalOutput: sessionMetrics.totalOutput,
      totalCached: sessionMetrics.totalCached,
      contextLimit: sessionMetrics.contextLimit,
    });

    // Memory info with v8 heap limit
    const mem = process.memoryUsage();
    const heapSizeLimit = v8.getHeapStatistics().heap_size_limit;
    const memoryCurrentMB =
      Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100;
    const memoryPeakMB =
      this.memorySnapshots.length > 0
        ? Math.max(...this.memorySnapshots.map((s) => s.heapUsedMB))
        : memoryCurrentMB;
    const heapUtilization =
      heapSizeLimit > 0 ? mem.heapUsed / heapSizeLimit : 0;

    // Optimization suggestions
    const suggestions = this.generateSuggestions({
      tokenEfficiency,
      toolStats: sessionMetrics.toolStats,
      memoryPeakMB,
      heapUtilization,
    });

    return {
      sessionDurationMs,
      apiWaitMs: sessionMetrics.totalApiWaitMs,
      toolExecMs: sessionMetrics.totalToolExecMs,
      latencyByModel,
      tokenEfficiency,
      memoryTrend: [...this.memorySnapshots],
      memoryPeakMB,
      memoryCurrentMB,
      heapUtilization,
      startupPhases: [...this.startupPhases],
      startupTotalMs: this.startupTotalMs,
      suggestions,
    };
  }

  /**
   * Clears all collected data and resets the session timer.
   */
  reset(): void {
    this.latencyBuffers.clear();
    this.memorySnapshots = [];
    this.startupPhases = [];
    this.startupTotalMs = 0;
    this.sessionStartTime = Date.now();
  }
}
