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
import { StartupStatsEvent, type StartupPhaseStats } from './types.js';
import { logStartupStats } from './loggers.js';

interface StartupPhase {
  name: string;
  startCpuUsage: NodeJS.CpuUsage;
  cpuUsage?: NodeJS.CpuUsage;
  details?: Record<string, string | number | boolean>;
  ended: boolean;
  relativeStart?: number;
  durationMs?: number;
}

/**
 * Handle returned by start() that allows ending the phase without repeating the phase name.
 */
export interface StartupPhaseHandle {
  end(details?: Record<string, string | number | boolean>): void;
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
   * Marks the start of a phase and returns a handle to end it.
   *
   * If a phase with the same name is already active (started but not ended),
   * this method will log a warning and return `undefined`. This allows for
   * idempotent calls in environments where initialization might happen multiple
   * times.
   *
   * @param phaseName The name of the phase.
   * @param details Optional additional details.
   * @param startAbsMs Optional absolute start time in milliseconds. If not provided, performance.now() is used.
   *
   * Callers should handle the potential `undefined` return value, typically
   * by using optional chaining: `handle?.end()`.
   */
  start(
    phaseName: string,
    details?: Record<string, string | number | boolean>,
    startAbsMs?: number,
  ): StartupPhaseHandle | undefined {
    const existingPhase = this.phases.get(phaseName);

    // Error if starting a phase that's already active.
    if (existingPhase && !existingPhase.ended) {
      debugLogger.warn(
        `[STARTUP] Cannot start phase '${phaseName}': phase is already active. Call end() before starting again.`,
      );
      return undefined;
    }

    let relativeStart: number | undefined = undefined;
    if (startAbsMs !== undefined) {
      relativeStart = startAbsMs - performance.timeOrigin;
    } else {
      const startMarkName = this.getStartMarkName(phaseName);
      performance.mark(startMarkName, { detail: details });
    }

    const phase: StartupPhase = {
      name: phaseName,
      startCpuUsage: process.cpuUsage(),
      details,
      ended: false,
      relativeStart,
    };

    this.phases.set(phaseName, phase);

    // Return a handle that allows ending the phase without repeating the name
    return {
      end: (endDetails?: Record<string, string | number | boolean>) => {
        this._end(phase, endDetails);
      },
    };
  }

  /**
   * Ends a phase by its name.
   */
  endPhase(
    phaseName: string,
    details?: Record<string, string | number | boolean>,
  ): void {
    const phase = this.phases.get(phaseName);
    if (!phase) {
      debugLogger.warn(
        `[STARTUP] Cannot end phase '${phaseName}': phase not found.`,
      );
      return;
    }
    this._end(phase, details);
  }

  /**
   * Records a phase that has already completed.
   */
  recordPhase(
    phaseName: string,
    startAbsMs: number,
    endAbsMs: number,
    details?: Record<string, string | number | boolean>,
  ): void {
    const relativeStart = startAbsMs - performance.timeOrigin;
    const relativeEnd = endAbsMs - performance.timeOrigin;
    const durationMs = endAbsMs - startAbsMs;

    // Node.js performance.measure throws if start or end are negative in the options object.
    // We clamp to 0 for the local performance entry, but preserve the real duration in the phase.
    performance.measure(phaseName, {
      start: Math.max(0, relativeStart),
      end: Math.max(0, relativeEnd),
    });

    this.phases.set(phaseName, {
      name: phaseName,
      startCpuUsage: { user: 0, system: 0 },
      cpuUsage: { user: 0, system: 0 },
      details,
      ended: true,
      durationMs,
    });
  }

  /**
   * Marks the end of a phase and calculates duration.
   * This is now a private method; callers should use the handle returned by start().
   */
  private _end(
    phase: StartupPhase,
    details?: Record<string, string | number | boolean>,
  ): void {
    // Error if ending a phase that's already ended.
    if (phase.ended) {
      debugLogger.warn(
        `[STARTUP] Cannot end phase '${phase.name}': phase was already ended.`,
      );
      return;
    }

    const endMarkName = this.getEndMarkName(phase.name);
    performance.mark(endMarkName, { detail: details });

    if (phase.relativeStart !== undefined) {
      const now = performance.now();
      phase.durationMs = now - phase.relativeStart;
      // Clamp start to 0 for the performance measure to avoid ERR_PERFORMANCE_INVALID_TIMESTAMP,
      // as relativeStart will be negative if it began before this process started.
      performance.measure(phase.name, {
        start: Math.max(0, phase.relativeStart),
        end: now,
      });
    } else {
      const startMarkName = this.getStartMarkName(phase.name);
      // Check if start mark exists before measuring
      if (performance.getEntriesByName(startMarkName).length === 0) {
        debugLogger.warn(
          `[STARTUP] Cannot measure phase '${phase.name}': start mark '${startMarkName}' not found (likely cleared by reset).`,
        );
        phase.ended = true;
        return;
      }
      performance.measure(phase.name, startMarkName, endMarkName);
    }

    phase.cpuUsage = process.cpuUsage(phase.startCpuUsage);
    phase.ended = true;
    if (details) {
      phase.details = { ...phase.details, ...details };
    }
  }

  /**
   * Flushes buffered metrics to the telemetry system.
   */
  flush(config: Config, options: { skipWarnings?: boolean } = {}): void {
    debugLogger.debug(
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
    const flushedPhaseNames: string[] = [];

    for (const phase of this.phases.values()) {
      // Handle incomplete phases.
      if (!phase.ended) {
        if (!options.skipWarnings) {
          debugLogger.warn(
            `[STARTUP] Phase '${phase.name}' was started but never ended. Skipping metrics.`,
          );
        }
        continue;
      }

      // Find the corresponding measure.
      const measure = measures.find((m) => m.name === phase.name);

      if (measure && phase.cpuUsage) {
        const durationMs = phase.durationMs ?? measure.duration;

        // Skip metrics with non-positive duration.
        if (durationMs <= 0) {
          continue;
        }

        const details = {
          ...commonDetails,
          cpu_usage_user: phase.cpuUsage.user,
          cpu_usage_system: phase.cpuUsage.system,
          ...phase.details,
        };

        debugLogger.debug(
          '[STARTUP] Recording metric for phase:',
          phase.name,
          'duration:',
          durationMs,
        );
        recordStartupPerformance(config, durationMs, {
          phase: phase.name,
          details,
        });
        flushedPhaseNames.push(phase.name);
      } else {
        debugLogger.debug(
          '[STARTUP] Skipping phase without measure:',
          phase.name,
        );
      }
    }

    // Emit StartupStats event
    const startupPhases: StartupPhaseStats[] = [];
    for (const phase of this.phases.values()) {
      if (!phase.ended) continue;
      const measure = measures.find((m) => m.name === phase.name);
      if (measure && phase.cpuUsage) {
        const durationMs = phase.durationMs ?? measure.duration;
        startupPhases.push({
          name: phase.name,
          duration_ms: durationMs,
          cpu_usage_user_usec: phase.cpuUsage.user,
          cpu_usage_system_usec: phase.cpuUsage.system,
          start_time_usec: (performance.timeOrigin + measure.startTime) * 1000,
          end_time_usec:
            (performance.timeOrigin + measure.startTime + measure.duration) *
            1000,
        });
      }
    }

    if (startupPhases.length > 0) {
      logStartupStats(
        config,
        new StartupStatsEvent(
          startupPhases,
          os.platform(),
          os.release(),
          fs.existsSync('/.dockerenv'),
        ),
      );
    }

    // Clear performance marks and measures for the successfully flushed phases.
    for (const phaseName of flushedPhaseNames) {
      const startMarkName = this.getStartMarkName(phaseName);
      const endMarkName = this.getEndMarkName(phaseName);

      performance.clearMarks(startMarkName);
      performance.clearMarks(endMarkName);
      performance.clearMeasures(phaseName);

      // Remove the successfully flushed phase from the tracking map.
      this.phases.delete(phaseName);
    }
  }
}

export const startupProfiler = StartupProfiler.getInstance();
