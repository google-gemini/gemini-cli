/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import v8 from 'node:v8';
import process from 'node:process';
import { Config } from '../config/config.js';
import { 
  recordMemoryUsage, 
  MemoryMetricType,
  isPerformanceMonitoringActive 
} from './metrics.js';

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  heapSizeLimit: number;
}

export interface ProcessMetrics {
  cpuUsage: NodeJS.CpuUsage;
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
}

export class MemoryMonitor {
  private config: Config;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastSnapshot: MemorySnapshot | null = null;
  private monitoringInterval: number = 5000; // 5 seconds default

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Start continuous memory monitoring
   */
  start(intervalMs: number = 5000): void {
    if (!isPerformanceMonitoringActive() || this.isRunning) {
      return;
    }

    this.monitoringInterval = intervalMs;
    this.isRunning = true;

    // Take initial snapshot
    this.takeSnapshot('monitoring_start');

    // Set up periodic monitoring
    this.intervalId = setInterval(() => {
      this.takeSnapshot('periodic');
    }, this.monitoringInterval);
  }

  /**
   * Stop continuous memory monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Take final snapshot
    this.takeSnapshot('monitoring_stop');
    this.isRunning = false;
  }

  /**
   * Take a memory snapshot and record metrics
   */
  takeSnapshot(context: string): MemorySnapshot {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      heapSizeLimit: heapStats.heap_size_limit,
    };

    // Record memory metrics if monitoring is active
    if (isPerformanceMonitoringActive()) {
      recordMemoryUsage(this.config, MemoryMetricType.HEAP_USED, snapshot.heapUsed, context);
      recordMemoryUsage(this.config, MemoryMetricType.HEAP_TOTAL, snapshot.heapTotal, context);
      recordMemoryUsage(this.config, MemoryMetricType.EXTERNAL, snapshot.external, context);
      recordMemoryUsage(this.config, MemoryMetricType.RSS, snapshot.rss, context);
    }

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Get current memory usage without recording metrics
   */
  getCurrentMemoryUsage(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    return {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      arrayBuffers: memUsage.arrayBuffers,
      heapSizeLimit: heapStats.heap_size_limit,
    };
  }

  /**
   * Get memory growth since last snapshot
   */
  getMemoryGrowth(): Partial<MemorySnapshot> | null {
    if (!this.lastSnapshot) {
      return null;
    }

    const current = this.getCurrentMemoryUsage();
    return {
      heapUsed: current.heapUsed - this.lastSnapshot.heapUsed,
      heapTotal: current.heapTotal - this.lastSnapshot.heapTotal,
      external: current.external - this.lastSnapshot.external,
      rss: current.rss - this.lastSnapshot.rss,
      arrayBuffers: current.arrayBuffers - this.lastSnapshot.arrayBuffers,
    };
  }

  /**
   * Get detailed heap statistics
   */
  getHeapStatistics(): v8.HeapInfo {
    return v8.getHeapStatistics();
  }

  /**
   * Get heap space statistics
   */
  getHeapSpaceStatistics(): v8.HeapSpaceInfo[] {
    return v8.getHeapSpaceStatistics();
  }

  /**
   * Get process CPU and memory metrics
   */
  getProcessMetrics(): ProcessMetrics {
    return {
      cpuUsage: process.cpuUsage(),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }

  /**
   * Record memory usage for a specific component or operation
   */
  recordComponentMemoryUsage(component: string, operation?: string): MemorySnapshot {
    const snapshot = this.takeSnapshot(operation ? `${component}_${operation}` : component);
    return snapshot;
  }

  /**
   * Force garbage collection and measure memory before/after
   * Only works if --expose-gc flag is used
   */
  measureGarbageCollection(): { before: MemorySnapshot; after: MemorySnapshot } | null {
    if (!global.gc) {
      return null;
    }

    const before = this.getCurrentMemoryUsage();
    global.gc();
    const after = this.getCurrentMemoryUsage();

    if (isPerformanceMonitoringActive()) {
      const memoryFreed = before.heapUsed - after.heapUsed;
      recordMemoryUsage(this.config, MemoryMetricType.HEAP_USED, memoryFreed, 'gc_freed');
    }

    return { before, after };
  }

  /**
   * Check if memory usage exceeds threshold
   */
  checkMemoryThreshold(thresholdMB: number): boolean {
    const current = this.getCurrentMemoryUsage();
    const currentMB = current.heapUsed / (1024 * 1024);
    return currentMB > thresholdMB;
  }

  /**
   * Get memory usage summary in MB
   */
  getMemoryUsageSummary(): {
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rssMB: number;
    heapSizeLimitMB: number;
  } {
    const current = this.getCurrentMemoryUsage();
    return {
      heapUsedMB: Math.round(current.heapUsed / (1024 * 1024) * 100) / 100,
      heapTotalMB: Math.round(current.heapTotal / (1024 * 1024) * 100) / 100,
      externalMB: Math.round(current.external / (1024 * 1024) * 100) / 100,
      rssMB: Math.round(current.rss / (1024 * 1024) * 100) / 100,
      heapSizeLimitMB: Math.round(current.heapSizeLimit / (1024 * 1024) * 100) / 100,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stop();
  }
}

// Singleton instance for global memory monitoring
let globalMemoryMonitor: MemoryMonitor | null = null;

/**
 * Initialize global memory monitor
 */
export function initializeMemoryMonitor(config: Config): MemoryMonitor {
  if (!globalMemoryMonitor) {
    globalMemoryMonitor = new MemoryMonitor(config);
  }
  return globalMemoryMonitor;
}

/**
 * Get global memory monitor instance
 */
export function getMemoryMonitor(): MemoryMonitor | null {
  return globalMemoryMonitor;
}

/**
 * Record memory usage for current operation
 */
export function recordCurrentMemoryUsage(config: Config, context: string): MemorySnapshot {
  const monitor = initializeMemoryMonitor(config);
  return monitor.takeSnapshot(context);
}

/**
 * Start global memory monitoring
 */
export function startGlobalMemoryMonitoring(config: Config, intervalMs: number = 5000): void {
  const monitor = initializeMemoryMonitor(config);
  monitor.start(intervalMs);
}

/**
 * Stop global memory monitoring
 */
export function stopGlobalMemoryMonitoring(): void {
  if (globalMemoryMonitor) {
    globalMemoryMonitor.stop();
  }
}