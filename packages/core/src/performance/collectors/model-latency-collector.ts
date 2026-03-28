/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseCollector } from './base-collector.js';
import type { ModelAPICall } from '../types.js';

export class ModelLatencyCollector extends BaseCollector {
  private calls: ModelAPICall[] = [];
  private static instance: ModelLatencyCollector;

  private constructor() {
    super(1000);
  }

  static getInstance(): ModelLatencyCollector {
    if (!ModelLatencyCollector.instance) {
      ModelLatencyCollector.instance = new ModelLatencyCollector();
    }
    return ModelLatencyCollector.instance;
  }

  recordCall(call: Omit<ModelAPICall, 'timestamp'>): void {
    const fullCall: ModelAPICall = {
      ...call,
      timestamp: Date.now(),
    };

    this.calls.push(fullCall);
    this.record(call.duration, 'ms', {
      model: call.model,
      operation: call.operation,
      success: call.success.toString(),
      cached: call.cached.toString(),
    });

    if (this.calls.length > this.maxSize) {
      this.calls = this.calls.slice(-this.maxSize);
    }

    if (call.duration > 5000) {
      // eslint-disable-next-line no-console
      console.warn(
        `\x1b[33m⚠️ Slow API response: ${call.model} took ${call.duration}ms\x1b[0m`,
      );
    }
  }

  getModelStats(): Record<
    string,
    {
      p50: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
      avg: number;
      count: number;
      totalTokens: number;
      avgTokens: number;
      successRate: number;
      cacheRate: number;
    }
  > {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: Record<string, any> = {};
    const byModel = new Map<string, ModelAPICall[]>();

    this.calls.forEach((call) => {
      if (!byModel.has(call.model)) {
        byModel.set(call.model, []);
      }
      byModel.get(call.model)!.push(call);
    });

    byModel.forEach((modelCalls, modelName) => {
      const durations = modelCalls.map((c) => c.duration).sort((a, b) => a - b);
      const successCount = modelCalls.filter((c) => c.success).length;
      const cachedCount = modelCalls.filter((c) => c.cached).length;
      const totalTokens = modelCalls.reduce(
        (sum, c) => sum + c.tokens.total,
        0,
      );

      result[modelName] = {
        p50: this.percentile(durations, 50),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99),
        min: durations[0] || 0,
        max: durations[durations.length - 1] || 0,
        avg: durations.reduce((a, b) => a + b, 0) / durations.length || 0,
        count: modelCalls.length,
        totalTokens,
        avgTokens: totalTokens / modelCalls.length || 0,
        successRate: (successCount / modelCalls.length) * 100,
        cacheRate: (cachedCount / modelCalls.length) * 100,
      };
    });

    return result;
  }

  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[index] || 0;
  }

  getRecentCalls(limit = 10): ModelAPICall[] {
    return [...this.calls]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getSlowestCalls(threshold = 2000, limit = 5): ModelAPICall[] {
    return this.calls
      .filter((c) => c.duration > threshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  getTokenUsage(): {
    total: number;
    byModel: Record<
      string,
      { prompt: number; completion: number; total: number }
    >;
  } {
    const byModel: Record<
      string,
      { prompt: number; completion: number; total: number }
    > = {};
    let total = 0;

    this.calls.forEach((call) => {
      if (!byModel[call.model]) {
        byModel[call.model] = { prompt: 0, completion: 0, total: 0 };
      }
      byModel[call.model].prompt += call.tokens.prompt;
      byModel[call.model].completion += call.tokens.completion;
      byModel[call.model].total += call.tokens.total;
      total += call.tokens.total;
    });

    return { total, byModel };
  }

  override clear(): void {
    this.calls = [];
    super.clear();
  }
}
