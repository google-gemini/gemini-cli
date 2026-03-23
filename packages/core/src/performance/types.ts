/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export interface MetricPoint {
  timestamp: number;
  value: number;
  unit: string;
  tags?: Record<string, string>;
}

export interface StartupPhase {
  name: string;
  duration: number;
  timestamp: number;
}

export interface ToolExecution {
  toolName: string;
  duration: number;
  success: boolean;
  timestamp: number;
  input?: string;
  error?: string;
}

export interface ModelAPICall {
  model: string;
  operation: string;
  duration: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  success: boolean;
  error?: string;
  timestamp: number;
  cached: boolean;
}

export interface SessionData {
  sessionId: string;
  startTime: number;
  endTime?: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  toolsCalled: Map<string, number>;
  filesModified: Set<string>;
  apiCalls: number;
  errors: number;
  commands: Map<string, number>;
}

export interface BaselineMetrics {
  version: string;
  timestamp: number;
  startup: {
    total: number;
    phases: Record<string, number>;
  };
  memory: {
    peakHeap: number;
    avgHeap: number;
  };
  tools: Record<
    string,
    {
      avgTime: number;
      successRate: number;
      callCount: number;
    }
  >;
  model: Record<
    string,
    {
      avgLatency: number;
      p95Latency: number;
      avgTokens: number;
      successRate: number;
    }
  >;
}

export interface Regression {
  metric: string;
  baseline: number;
  current: number;
  change: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  threshold: number;
  recommendation?: string;
}

export interface RegressionReport {
  version: string;
  timestamp: number;
  baselineVersion: string;
  passed: boolean;
  regressions: Regression[];
  improvements: Regression[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    critical: number;
  };
}

export interface PerformanceData {
  timestamp: number;
  version: string;
  startup: {
    total: number;
    phases: Array<{ name: string; duration: number; percentage: number }>;
    suggestions: string[];
  };
  memory: {
    current: NodeJS.MemoryUsage;
    trend: {
      direction: 'increasing' | 'decreasing' | 'stable';
      ratePerMinute: number;
      projectedOOMIn?: number;
    };
    stats: {
      min: number;
      max: number;
      avg: number;
      count: number;
    };
  };
  tools: {
    stats: Record<
      string,
      {
        callCount: number;
        avgTime: number;
        minTime: number;
        maxTime: number;
        successRate: number;
        lastCalled: number;
      }
    >;
    frequent: Array<{ tool: string; count: number }>;
    slow: Array<{ tool: string; avgTime: number }>;
  };
  model: {
    stats: Record<
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
    >;
    recentCalls: ModelAPICall[];
    tokenUsage: {
      total: number;
      byModel: Record<
        string,
        { prompt: number; completion: number; total: number }
      >;
    };
  };
  session: {
    current: {
      sessionId: string;
      duration: number;
      tokens: { prompt: number; completion: number; total: number };
      toolsCalled: Array<{ name: string; count: number }>;
      filesModified: number;
      apiCalls: number;
      errors: number;
      commands: Array<{ name: string; count: number }>;
    };
    historical: Array<{
      sessionId: string;
      duration: number;
      tokens: number;
      tools: number;
      files: number;
      date: string;
    }>;
    summary: {
      totalSessions: number;
      totalTokens: number;
      totalToolsCalled: number;
      totalFilesModified: number;
      avgSessionDuration: number;
      avgTokensPerSession: number;
    };
  };
}
