/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { StartupCollector } from './collectors/startup-collector.js';
import { MemoryCollector } from './collectors/memory-collector.js';
import { ToolExecutionCollector } from './collectors/tool-execution-collector.js';
import { ModelLatencyCollector } from './collectors/model-latency-collector.js';
import { SessionCollector } from './collectors/session-collector.js';
import { MetricsStore } from './storage/metrics-store.js';
import type { PerformanceData } from './types.js';
import { getVersion } from '../utils/version.js';

export class PersistenceManager {
  private static metricsStore = new MetricsStore();

  static async persist(): Promise<void> {
    const data = await this.gatherMetrics();
    if (
      Object.keys(data.tools.stats).length > 0 ||
      data.model.recentCalls.length > 0
    ) {
      await this.metricsStore.saveMetrics(data);
    }
  }

  static persistSync(): void {
    const data = this.gatherMetricsSync();
    const toolCount = Object.keys(data.tools.stats).length;
    const modelCount = data.model.recentCalls.length;

    // eslint-disable-next-line no-console
    console.error(
      `\n[PERF] Attempting to save metrics... (Tools: ${toolCount}, Models: ${modelCount})`,
    );

    if (toolCount > 0 || modelCount > 0) {
      try {
        const dir = path.join(os.homedir(), '.gemini', 'metrics');

        // Ensure secure directory creation
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        } else {
          // Enforce correct permissions if directory already exists
          try {
            fs.chmodSync(dir, 0o700);
          } catch {
            // ignore chmod errors (e.g., on Windows)
          }
        }

        const filename = `metrics-${data.version}-${Date.now()}.json`;
        const fullPath = path.join(dir, filename);

        fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), {
          mode: 0o600,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[PERF] ❌ Failed to save metrics: ${e}`);
      }
    } else {
      // eslint-disable-next-line no-console
      console.error(
        '[PERF] ℹ️ Skipping save: No new tool or model data recorded in this session.',
      );
    }
  }

  private static async gatherMetrics(): Promise<PerformanceData> {
    const startup = StartupCollector.getInstance();
    const memory = MemoryCollector.getInstance();
    const tools = ToolExecutionCollector.getInstance();
    const model = ModelLatencyCollector.getInstance();
    const session = SessionCollector.getInstance();

    const currentMemory = memory.getCurrent();

    return {
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
        // Use the same 5-minute window that getStats() and the chart both use.
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
  }

  /** Synchronous variant for persistSync – uses CLI_VERSION env var since getVersion() is async. */
  private static gatherMetricsSync(): PerformanceData {
    const startup = StartupCollector.getInstance();
    const memory = MemoryCollector.getInstance();
    const tools = ToolExecutionCollector.getInstance();
    const model = ModelLatencyCollector.getInstance();
    const session = SessionCollector.getInstance();

    const currentMemory = memory.getCurrent();

    return {
      timestamp: Date.now(),
      version: process.env['CLI_VERSION'] || 'unknown',

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
  }
}
