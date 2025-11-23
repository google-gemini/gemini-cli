/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { performance } from 'node:perf_hooks';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { Config } from '../config/config.js';
import { recordStartupPerformance } from './metrics.js';
import { debugLogger } from '../utils/debugLogger.js';

interface StartupPhase {
  name: string;
  startCpuUsage: NodeJS.CpuUsage;
  cpuUsage?: NodeJS.CpuUsage;
  details?: Record<string, string | number | boolean>;
  ended: boolean;
}

/**
 * Buffers startup performance metrics until the telemetry system is fully initialized.
 */
export class StartupProfiler {
  private phases: Map<string, StartupPhase> = new Map();
  private static instance: StartupProfiler;

  private constructor() {}

  static getInstance(): StartupProfiler {
    if (!StartupProfiler.instance) {
      StartupProfiler.instance = new StartupProfiler();
    }
    return StartupProfiler.instance;
  }

  /**
   * Returns the mark name for the start of a phase.
   */
  private getStartMarkName(phaseName: string): string {
    return `startup:${phaseName}:start`;
  }

  /**
   * Returns the mark name for the end of a phase.
   */
  private getEndMarkName(phaseName: string): string {
    return `startup:${phaseName}:end`;
  }

  /**
   * Marks the start of a phase.
   */
  start(
    phaseName: string,
    details?: Record<string, string | number | boolean>,
  ): void {
    const existingPhase = this.phases.get(phaseName);

    // Error if starting a phase that's already active.
    if (existingPhase && !existingPhase.ended) {
      throw new Error(
        `[STARTUP] Cannot start phase '${phaseName}': phase is already active. Call end() before starting again.`,
      );
    }

    const startMarkName = this.getStartMarkName(phaseName);
    performance.mark(startMarkName, { detail: details });

    this.phases.set(phaseName, {
      name: phaseName,
      startCpuUsage: process.cpuUsage(),
      details,
      ended: false,
    });
  }

  /**
   * Marks the end of a phase and calculates duration.
   */
  end(
    phaseName: string,
    details?: Record<string, string | number | boolean>,
  ): void {
    const phase = this.phases.get(phaseName);

    // Error if ending a phase that was never started.
    if (!phase) {
      throw new Error(
        `[STARTUP] Cannot end phase '${phaseName}': phase was never started.`,
      );
    }

    // Error if ending a phase that's already ended.
    if (phase.ended) {
      throw new Error(
        `[STARTUP] Cannot end phase '${phaseName}': phase was already ended.`,
      );
    }

    const startMarkName = this.getStartMarkName(phaseName);
    const endMarkName = this.getEndMarkName(phaseName);

    performance.mark(endMarkName, { detail: details });
    performance.measure(phaseName, startMarkName, endMarkName);

    phase.cpuUsage = process.cpuUsage(phase.startCpuUsage);
    phase.ended = true;
    if (details) {
      phase.details = { ...phase.details, ...details };
    }
  }

  /**
   * Flushes buffered metrics to the telemetry system.
   */
  flush(config: Config): void {
    debugLogger.log(
      '[STARTUP] StartupProfiler.flush() called with',
      this.phases.size,
      'phases',
    );

    const commonDetails = {
      os_platform: os.platform(),
      os_arch: os.arch(),
      os_release: os.release(),
      is_docker: fs.existsSync('/.dockerenv'),
    };

    // Get all performance measures.
    const measures = performance.getEntriesByType('measure');

    for (const phase of this.phases.values()) {
      // Warn about incomplete phases.
      if (!phase.ended) {
        debugLogger.warn(
          `[STARTUP] Phase '${phase.name}' was started but never ended. Skipping metrics.`,
        );
        continue;
      }

      // Find the corresponding measure.
      const measure = measures.find((m) => m.name === phase.name);

      if (measure && phase.cpuUsage) {
        const details = {
          ...commonDetails,
          cpu_usage_user: phase.cpuUsage.user,
          cpu_usage_system: phase.cpuUsage.system,
          ...phase.details,
        };

        debugLogger.log(
          '[STARTUP] Recording metric for phase:',
          phase.name,
          'duration:',
          measure.duration,
        );
        recordStartupPerformance(config, measure.duration, {
          phase: phase.name,
          details,
        });
      } else {
        debugLogger.log(
          '[STARTUP] Skipping phase without measure:',
          phase.name,
        );
      }
    }

    // Clear performance marks and measures for tracked phases.
    for (const phaseName of this.phases.keys()) {
      const startMarkName = this.getStartMarkName(phaseName);
      const endMarkName = this.getEndMarkName(phaseName);

      performance.clearMarks(startMarkName);
      performance.clearMarks(endMarkName);
      performance.clearMeasures(phaseName);
    }

    // Clear buffer after flushing.
    this.phases.clear();
  }
}

export const startupProfiler = StartupProfiler.getInstance();
