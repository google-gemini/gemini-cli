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
  startTime: number;
  duration?: number;
  details?: Record<string, string | number | boolean>;
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
   * Marks the start of a phase.
   */
  start(
    phaseName: string,
    details?: Record<string, string | number | boolean>,
  ): void {
    this.phases.set(phaseName, {
      name: phaseName,
      startTime: performance.now(),
      details,
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
    if (phase) {
      phase.duration = performance.now() - phase.startTime;
      if (details) {
        phase.details = { ...phase.details, ...details };
      }
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

    for (const phase of this.phases.values()) {
      if (phase.duration !== undefined) {
        const cpuUsage = process.cpuUsage();
        const details = {
          ...commonDetails,
          cpu_usage_user: cpuUsage.user,
          cpu_usage_system: cpuUsage.system,
          ...phase.details,
        };

        debugLogger.log(
          '[STARTUP] Recording metric for phase:',
          phase.name,
          'duration:',
          phase.duration,
        );
        recordStartupPerformance(config, phase.duration, {
          phase: phase.name,
          details,
        });
      } else {
        debugLogger.log(
          '[STARTUP] Skipping phase without duration:',
          phase.name,
        );
      }
    }
    // Clear buffer after flushing.
    this.phases.clear();
  }
}

export const startupProfiler = StartupProfiler.getInstance();
