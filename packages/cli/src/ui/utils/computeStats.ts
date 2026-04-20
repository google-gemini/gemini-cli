/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SessionMetrics,
  ComputedSessionStats,
  ModelMetrics,
} from '../contexts/SessionContext.js';
import type { ToolCallStats } from '@google/gemini-cli-core';

export interface PerModelPerfStats {
  name: string;
  requests: number;
  avgLatencyMs: number;
  errorRate: number;
  totalTokens: number;
}

export interface TopToolStats {
  name: string;
  stats: ToolCallStats;
  avgDurationMs: number;
}

export interface MemoryStats {
  rss: number;
  heapUsed: number;
  heapTotal: number;
}

export interface PerfStats extends ComputedSessionStats {
  idleTimeMs: number;
  perModelStats: PerModelPerfStats[];
  topToolsByDuration: TopToolStats[];
  memory: MemoryStats;
  tokensPerRequest: number;
  totalOutputTokens: number;
  totalRequests: number;
}

export function calculateErrorRate(metrics: ModelMetrics): number {
  if (metrics.api.totalRequests === 0) {
    return 0;
  }
  return (metrics.api.totalErrors / metrics.api.totalRequests) * 100;
}

export function calculateAverageLatency(metrics: ModelMetrics): number {
  if (metrics.api.totalRequests === 0) {
    return 0;
  }
  return metrics.api.totalLatencyMs / metrics.api.totalRequests;
}

export function calculateCacheHitRate(metrics: ModelMetrics): number {
  if (metrics.tokens.prompt === 0) {
    return 0;
  }
  return (metrics.tokens.cached / metrics.tokens.prompt) * 100;
}

export const computeSessionStats = (
  metrics: SessionMetrics,
): ComputedSessionStats => {
  const { models, tools, files } = metrics;
  const totalApiTime = Object.values(models).reduce(
    (acc, model) => acc + model.api.totalLatencyMs,
    0,
  );
  const totalToolTime = tools.totalDurationMs;
  const agentActiveTime = totalApiTime + totalToolTime;
  const apiTimePercent =
    agentActiveTime > 0 ? (totalApiTime / agentActiveTime) * 100 : 0;
  const toolTimePercent =
    agentActiveTime > 0 ? (totalToolTime / agentActiveTime) * 100 : 0;

  const totalCachedTokens = Object.values(models).reduce(
    (acc, model) => acc + model.tokens.cached,
    0,
  );
  const totalInputTokens = Object.values(models).reduce(
    (acc, model) => acc + model.tokens.input,
    0,
  );
  const totalPromptTokens = Object.values(models).reduce(
    (acc, model) => acc + model.tokens.prompt,
    0,
  );
  const cacheEfficiency =
    totalPromptTokens > 0 ? (totalCachedTokens / totalPromptTokens) * 100 : 0;

  const totalDecisions =
    tools.totalDecisions.accept +
    tools.totalDecisions.reject +
    tools.totalDecisions.modify +
    tools.totalDecisions.auto_accept;
  const successRate =
    tools.totalCalls > 0 ? (tools.totalSuccess / tools.totalCalls) * 100 : 0;
  const agreementRate =
    totalDecisions > 0
      ? ((tools.totalDecisions.accept + tools.totalDecisions.auto_accept) /
          totalDecisions) *
        100
      : 0;

  return {
    totalApiTime,
    totalToolTime,
    agentActiveTime,
    apiTimePercent,
    toolTimePercent,
    cacheEfficiency,
    totalDecisions,
    successRate,
    agreementRate,
    totalCachedTokens,
    totalInputTokens,
    totalPromptTokens,
    totalLinesAdded: files.totalLinesAdded,
    totalLinesRemoved: files.totalLinesRemoved,
  };
};

export function computePerfStats(
  metrics: SessionMetrics,
  wallTimeMs: number,
): PerfStats {
  const base = computeSessionStats(metrics);
  const idleTimeMs = Math.max(0, wallTimeMs - base.agentActiveTime);

  const perModelStats: PerModelPerfStats[] = Object.entries(metrics.models).map(
    ([name, m]) => ({
      name,
      requests: m.api.totalRequests,
      avgLatencyMs: calculateAverageLatency(m),
      errorRate: calculateErrorRate(m),
      totalTokens: m.tokens.total,
    }),
  );

  const topToolsByDuration: TopToolStats[] = Object.entries(
    metrics.tools.byName,
  )
    .filter(([, stats]) => stats.count > 0)
    .sort(([, a], [, b]) => b.durationMs - a.durationMs)
    .slice(0, 5)
    .map(([name, stats]) => ({
      name,
      stats,
      avgDurationMs: stats.count > 0 ? stats.durationMs / stats.count : 0,
    }));

  const mem = process.memoryUsage();
  const memory: MemoryStats = {
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
  };

  const totalRequests = Object.values(metrics.models).reduce(
    (acc, m) => acc + m.api.totalRequests,
    0,
  );
  const totalOutputTokens = Object.values(metrics.models).reduce(
    (acc, m) => acc + m.tokens.candidates,
    0,
  );
  const tokensPerRequest =
    totalRequests > 0
      ? (base.totalInputTokens + totalOutputTokens) / totalRequests
      : 0;

  return {
    ...base,
    idleTimeMs,
    perModelStats,
    topToolsByDuration,
    memory,
    tokensPerRequest,
    totalOutputTokens,
    totalRequests,
  };
}
