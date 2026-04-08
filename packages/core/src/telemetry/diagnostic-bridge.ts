/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HeapInvestigationSession } from './heap-investigation/investigation-session.js';
import type {
  HdslReport,
  InvestigationOptions,
  InvestigationProgress,
  HdslTrigger,
} from './heap-investigation/types.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';

/** Minimum milliseconds between investigations (5 minutes) */
const MIN_INVESTIGATION_INTERVAL_MS = 5 * 60 * 1000;

/** Growth percentage threshold that triggers an investigation (on top of HighWaterMark's 5%) */
const DIAGNOSTIC_GROWTH_THRESHOLD_PERCENT = 15;

export type DiagnosticEventCallback = (report: HdslReport) => void;
export type DiagnosticProgressCallback = (
  progress: InvestigationProgress,
) => void;

/**
 * DiagnosticBridge connects the existing HighWaterMarkTracker threshold signals
 * to the HeapInvestigationSession pipeline.
 *
 * This is the key architectural piece that turns passive memory monitoring
 * into active, automated leak investigation — without any user intervention.
 *
 * Usage:
 *   const bridge = new DiagnosticBridge();
 *   highWaterMarkTracker.setDiagnosticCallback(
 *     bridge.onThresholdExceeded.bind(bridge)
 *   );
 */
export class DiagnosticBridge {
  private lastInvestigationMs: number = 0;
  private activeSession: HeapInvestigationSession | null = null;
  private readonly options: InvestigationOptions;

  constructor(
    private readonly onComplete?: DiagnosticEventCallback,
    private readonly onProgress?: DiagnosticProgressCallback,
    options: InvestigationOptions = {},
  ) {
    this.options = {
      phase_interval_ms: 30_000,
      emit_perfetto: true,
      ...options,
    };
  }

  /**
   * Called by HighWaterMarkTracker when a new high-water mark is recorded.
   * This is the primary entry point for reactive investigation.
   *
   * @param metricType - 'heap_used' or 'rss'
   * @param currentValue - Current value in bytes
   * @param previousWaterMark - Previous high-water mark in bytes
   */
  onThresholdExceeded(
    metricType: string,
    currentValue: number,
    previousWaterMark: number,
  ): void {
    const growthPercent =
      previousWaterMark > 0
        ? ((currentValue - previousWaterMark) / previousWaterMark) * 100
        : 0;

    // Only trigger if growth is above our secondary threshold
    if (growthPercent < DIAGNOSTIC_GROWTH_THRESHOLD_PERCENT) {
      debugLogger.debug(
        `[DiagnosticBridge] Growth ${growthPercent.toFixed(1)}% below diagnostic threshold, skipping`,
      );
      return;
    }

    // Throttle: don't run investigations too frequently
    const now = Date.now();
    if (now - this.lastInvestigationMs < MIN_INVESTIGATION_INTERVAL_MS) {
      debugLogger.debug(
        `[DiagnosticBridge] Investigation throttled (last: ${((now - this.lastInvestigationMs) / 1000).toFixed(0)}s ago)`,
      );
      return;
    }

    // Don't start a new session if one is already running
    if (this.activeSession !== null) {
      debugLogger.debug(
        '[DiagnosticBridge] Investigation already in progress, skipping',
      );
      return;
    }

    // Check if enabled via environment variable
    if (process.env['GEMINI_MEMORY_DIAGNOSTICS'] !== '1') {
      debugLogger.debug(
        '[DiagnosticBridge] Diagnostics disabled (set GEMINI_MEMORY_DIAGNOSTICS=1 to enable)',
      );
      return;
    }

    this.lastInvestigationMs = now;

    debugLogger.debug(
      `[DiagnosticBridge] Triggering investigation: ${metricType} grew ${growthPercent.toFixed(1)}% (${(currentValue / 1024 / 1024).toFixed(1)} MB)`,
    );

    coreEvents.emitFeedback(
      'info',
      `🔍 Memory growth detected (+${growthPercent.toFixed(1)}%). Starting automated heap investigation...`,
    );

    void this.runInvestigation(
      metricType,
      currentValue,
      previousWaterMark,
      growthPercent,
    );
  }

  /** Aborts the current investigation if one is running */
  abortCurrentInvestigation(): void {
    if (this.activeSession) {
      this.activeSession.abort();
      this.activeSession = null;
      debugLogger.debug('[DiagnosticBridge] Investigation aborted');
    }
  }

  private async runInvestigation(
    metricType: string,
    currentValue: number,
    previousWaterMark: number,
    growthPercent: number,
  ): Promise<void> {
    const trigger: HdslTrigger = {
      type: 'threshold',
      reason: metricType,
      heap_used_bytes: currentValue,
      triggered_at_ms: Date.now(),
      metric: metricType as 'heap_used' | 'rss',
      growth_percent: growthPercent,
      absolute_bytes: currentValue - previousWaterMark,
      previous_high_water_mark_bytes: previousWaterMark,
      session_uptime_ms: Math.round(process.uptime() * 1000),
    };

    const progressHandler = (progress: InvestigationProgress) => {
      this.onProgress?.(progress);
      debugLogger.debug(
        `[DiagnosticBridge] [${progress.phase}] ${progress.message}`,
      );
    };

    const session = new HeapInvestigationSession(
      trigger,
      this.options,
      progressHandler,
    );
    this.activeSession = session;

    try {
      const report = await session.run();
      this.activeSession = null;

      // Fire the completion callback
      this.onComplete?.(report);

      coreEvents.emitFeedback(
        'info',
        `✅ Heap investigation complete (confidence: ${(report.confidence * 100).toFixed(0)}%). ` +
          `${report.patterns.length > 0 ? `Patterns: ${report.patterns.join(', ')}` : 'No leak patterns detected.'} ` +
          (report.perfetto_path
            ? `\nPerfetto trace: ${report.perfetto_path}`
            : ''),
      );
    } catch (error) {
      this.activeSession = null;
      const msg = error instanceof Error ? error.message : String(error);
      debugLogger.warn(`[DiagnosticBridge] Investigation failed: ${msg}`);
      coreEvents.emitFeedback(
        'warning',
        `⚠️ Heap investigation failed: ${msg}`,
      );
    }
  }

  /** Returns whether an investigation is currently running */
  get isInvestigating(): boolean {
    return this.activeSession !== null;
  }

  /** Returns timestamp of last completed investigation */
  get lastInvestigationTimestamp(): number {
    return this.lastInvestigationMs;
  }
}

/** Singleton diagnostic bridge instance */
let globalDiagnosticBridge: DiagnosticBridge | null = null;

/** Initializes the global diagnostic bridge */
export function initializeDiagnosticBridge(
  onComplete?: DiagnosticEventCallback,
  onProgress?: DiagnosticProgressCallback,
  options?: InvestigationOptions,
): DiagnosticBridge {
  if (!globalDiagnosticBridge) {
    globalDiagnosticBridge = new DiagnosticBridge(
      onComplete,
      onProgress,
      options,
    );
  }
  return globalDiagnosticBridge;
}

/** Gets the global diagnostic bridge (or null if not initialized) */
export function getDiagnosticBridge(): DiagnosticBridge | null {
  return globalDiagnosticBridge;
}

/** Resets the global bridge (test helper) */
export function _resetDiagnosticBridgeForTests(): void {
  globalDiagnosticBridge?.abortCurrentInvestigation();
  globalDiagnosticBridge = null;
}
