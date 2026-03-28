/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  StartupCollector,
  MemoryCollector,
  ToolExecutionCollector,
  ModelLatencyCollector,
  SessionCollector,
  type PerformanceData,
  MetricsStore,
  PersistenceManager,
  getVersion,
} from '@google/gemini-cli-core';

// NOTE: DevToolsPerformanceBridge is NOT imported here.
// Its underlying @google/gemini-cli-devtools package executes blocking I/O
// at static import time, freezing the Node.js event loop before any UI renders.

export class PerformanceService {
  private static initialized = false;
  private static metricsStore = new MetricsStore();

  static async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      // Standard hooks (quiet mode for CLI)
      this.setupHooksInternal(true);

      // Dynamically import DevToolsPerformanceBridge to avoid blocking I/O at static import time
      const { DevToolsPerformanceBridge } = await import(
        '@google/gemini-cli-core'
      );
      if (DevToolsPerformanceBridge) {
        DevToolsPerformanceBridge.getInstance().startMonitoring();
      }
      this.initialized = true;
    } catch (_error) {
      // Silent failure for bridge - we still want basic stats to work
      this.initialized = true;
    }
  }

  static async getCurrentMetrics(): Promise<PerformanceData> {
    // Standard collectors are already initialized in ensureInitialized
    // but we can ensure basic monitoring here too
    const startup = StartupCollector.getInstance();
    const memory = MemoryCollector.getInstance();
    const tools = ToolExecutionCollector.getInstance();
    const model = ModelLatencyCollector.getInstance();
    const session = SessionCollector.getInstance();

    // HACK: Check internal `interval` property to see if monitoring is active.
    // MemoryCollector does not expose a public API for this,
    // so we safely check without unsafe assertions.
    const hasInterval = (obj: unknown): obj is { interval: unknown } => typeof obj === 'object' && obj !== null && 'interval' in obj;

    const memUnknown = memory as unknown;
    const maybeInterval = hasInterval(memUnknown)
      ? memUnknown.interval
      : undefined;

    if (!maybeInterval) {
      memory.startMonitoring(5000);
    }
    const currentMemory = memory.getCurrent();

    const data: PerformanceData = {
      timestamp: Date.now(),
      version: await getVersion(),

      startup: {
        total: startup.getTotalTime(),
        phases: startup.getBreakdown(),
        suggestions: startup.getOptimizationSuggestions(),
      },

      memory: {
        current: {
          ...currentMemory,
          arrayBuffers: currentMemory.arrayBuffers ?? 0,
        },
        trend: memory.getTrend(),
        stats: memory.getStats(300000),
      },

      tools: {
        stats: tools.getToolStats(),
        frequent: tools.getFrequentTools(5),
        slow: tools.getSlowTools(1000),
      },

      model: {
        stats: model.getModelStats(),
        recentCalls: model.getRecentCalls(5),
        tokenUsage: model.getTokenUsage(),
      },

      session: {
        current: session.getCurrentSession(),
        historical: session.getHistoricalSessions(5),
        summary: session.getSummary(),
      },
    };

    return data;
  }

  static async loadRecentMetrics(): Promise<PerformanceData[]> {
    return this.metricsStore.loadRecentMetrics(10);
  }

  static async persist(): Promise<void> {
    await PersistenceManager.persist();
  }

  static persistSync(): void {
    PersistenceManager.persistSync();
  }

  static setupHooks(): void {
    if (this.initialized) return;
    this.setupHooksInternal(false);
    this.initialized = true;
  }

  private static setupHooksInternal(quiet = false): void {
    const memory = MemoryCollector.getInstance();

    memory.onWarning((warning: string, level: 'warning' | 'critical') => {
      if (!quiet) {
        // eslint-disable-next-line no-console
        console.warn(
          `\x1b[${level === 'critical' ? '31' : '33'}m⚠️ ${warning}\x1b[0m`,
        );
      }
    });

    memory.startMonitoring(5000);
    if (!quiet) {
      // eslint-disable-next-line no-console
      console.log('📊 Performance monitoring active');
    }
  }

  static cleanup(): void {
    MemoryCollector.getInstance().stopMonitoring();
  }
}
