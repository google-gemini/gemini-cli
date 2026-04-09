/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import type { Config } from '../config/config.js';
import {
  recordEventLoopDelay,
  isPerformanceMonitoringActive,
} from './metrics.js';

export class EventLoopMonitor {
  private eventLoopHistogram: IntervalHistogram | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start(config: Config, intervalMs: number = 10000): void {
    const isEnabled =
      process.env['GEMINI_EVENT_LOOP_MONITOR_ENABLED'] === 'true';
    if (!isEnabled || !isPerformanceMonitoringActive() || this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.eventLoopHistogram = monitorEventLoopDelay({ resolution: 10 });
    this.eventLoopHistogram.enable();

    this.intervalId = setInterval(() => {
      this.takeSnapshot(config);
    }, intervalMs).unref();
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.eventLoopHistogram) {
      this.eventLoopHistogram.disable();
      this.eventLoopHistogram = null;
    }

    this.isRunning = false;
  }

  private takeSnapshot(config: Config): void {
    if (!this.eventLoopHistogram) {
      return;
    }

    const p50 = this.eventLoopHistogram.percentile(50) / 1e6;
    const p95 = this.eventLoopHistogram.percentile(95) / 1e6;
    const max = this.eventLoopHistogram.max / 1e6;

    recordEventLoopDelay(config, p50, {
      percentile: 'p50',
      component: 'event_loop_monitor',
    });
    recordEventLoopDelay(config, p95, {
      percentile: 'p95',
      component: 'event_loop_monitor',
    });
    recordEventLoopDelay(config, max, {
      percentile: 'max',
      component: 'event_loop_monitor',
    });
  }
}

let globalEventLoopMonitor: EventLoopMonitor | null = null;

export function startGlobalEventLoopMonitoring(
  config: Config,
  intervalMs?: number,
): void {
  if (!globalEventLoopMonitor) {
    globalEventLoopMonitor = new EventLoopMonitor();
  }
  globalEventLoopMonitor.start(config, intervalMs);
}

export function stopGlobalEventLoopMonitoring(): void {
  if (globalEventLoopMonitor) {
    globalEventLoopMonitor.stop();
    globalEventLoopMonitor = null;
  }
}

export function getEventLoopMonitor(): EventLoopMonitor | null {
  return globalEventLoopMonitor;
}
