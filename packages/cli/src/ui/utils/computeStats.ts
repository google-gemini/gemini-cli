/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SessionMetrics,
  ComputedSessionStats,
  ModelMetrics,
} from '../contexts/SessionContext.js';

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
  const { models, tools } = metrics;
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
  const totalPromptTokens = Object.values(models).reduce(
    (acc, model) => acc + model.tokens.prompt,
    0,
  );
  const cacheEfficiency =
    totalPromptTokens > 0 ? (totalCachedTokens / totalPromptTokens) * 100 : 0;

  const totalDecisions =
    tools.totalDecisions.accept +
    tools.totalDecisions.reject +
    tools.totalDecisions.modify;
  const successRate =
    tools.totalCalls > 0 ? (tools.totalSuccess / tools.totalCalls) * 100 : 0;
  const agreementRate =
    totalDecisions > 0
      ? (tools.totalDecisions.accept / totalDecisions) * 100
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
    totalPromptTokens,
  };
};
