/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StartupProfiler } from './startupProfiler.js';
import { getMemoryMonitor } from './memory-monitor.js';
import {
  getToolStatsSnapshot,
  getApiStatsSnapshot,
  getSessionStatsSnapshot,
  type ToolStatsSnapshot,
  type ApiStatsSnapshot,
  type SessionStatsSnapshot,
} from './metrics.js';

/** Startup phase entry for perf snapshot. */
export interface StartupPhaseSnapshot {
  name: string;
  duration_ms: number;
}

/** Memory snapshot for perf dashboard. */
export interface MemorySnapshotPerf {
  heapUsed: number;
  rss: number;
  highWaterMark: number;
}

/** Aggregated performance snapshot for in-CLI dashboard and export. */
export interface PerformanceSnapshot {
  startup: StartupPhaseSnapshot[];
  memory: MemorySnapshotPerf;
  tools: ToolStatsSnapshot[];
  api: ApiStatsSnapshot;
  session: SessionStatsSnapshot;
}

/**
 * Aggregates existing telemetry data for the in-CLI performance dashboard.
 * Does not redesign or record new telemetry; only exposes current in-memory state.

 * @see Issue #20313 – Add `/perf` slash command exposing existing telemetry
 */
export class PerformanceDataService {
  /**
   * Builds a single snapshot from StartupProfiler, MemoryMonitor, and metrics.
   */
  static getPerformanceSnapshot(): PerformanceSnapshot {
    const profiler = StartupProfiler.getInstance();
    const startup = profiler.getStartupPhases();

    const memoryMonitor = getMemoryMonitor();
    let memory: MemorySnapshotPerf = {
      heapUsed: 0,
      rss: 0,
      highWaterMark: 0,
    };
    if (memoryMonitor) {
      const current = memoryMonitor.getCurrentMemoryUsage();
      const hwm = memoryMonitor.getHighWaterMarkStats();
      const highWaterMark = Math.max(hwm['rss'] ?? 0, hwm['heap_used'] ?? 0);
      memory = {
        heapUsed: current.heapUsed,
        rss: current.rss,
        highWaterMark,
      };
    }

    const tools = getToolStatsSnapshot();
    const api = getApiStatsSnapshot();
    const session = getSessionStatsSnapshot();

    return {
      startup,
      memory,
      tools,
      api,
      session,
    };
  }
}
