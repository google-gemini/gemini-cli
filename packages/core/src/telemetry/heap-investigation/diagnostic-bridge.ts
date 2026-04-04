/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DiagnosticBridge: reactive integration between the existing
 * `HighWaterMarkTracker` (passive monitor) and the `HeapInvestigationSession`
 * (active diagnostic).
 *
 * This addresses the open question from the thread (SUNDRAM07, Anjaligarhwal):
 * "Would a reactive trigger be in scope, or should skills stay user-initiated?"
 *
 * Architecture:
 *  HighWaterMarkTracker → onThresholdExceeded() → DiagnosticBridge
 *    → HeapInvestigationSession (3-snapshot investigation)
 *    → HdslReport (HDSL + Perfetto trace)
 *
 * The bridge debounces rapid threshold breaches (1-minute cooldown) to prevent
 * investigation storms during GC-pressure episodes.
 */

import {
  HeapInvestigationSession,
  type ProgressCallback,
} from './investigation-session.js';
import type { HdslReport, HdslTrigger, InvestigationOptions } from './types.js';

export interface DiagnosticBridgeOptions {
  /** Minimum milliseconds between auto-triggered investigations (default: 60s) */
  cooldownMs?: number;
  /** Options forwarded to HeapInvestigationSession */
  investigationOptions?: InvestigationOptions;
  /** Progress callback forwarded to the session */
  onProgress?: ProgressCallback;
  /** Called when an investigation completes successfully */
  onReport?: (report: HdslReport) => void;
  /** Called if an investigation fails */
  onError?: (err: Error) => void;
}

const DEFAULT_COOLDOWN_MS = 60_000;

/**
 * Reactive bridge between HighWaterMarkTracker threshold events and
 * HeapInvestigationSession.
 *
 * Usage:
 * ```ts
 * const bridge = new DiagnosticBridge({ onReport: (r) => console.log(r.summary) });
 *
 * // In HighWaterMarkTracker callback:
 * bridge.onThresholdExceeded('high_water_mark', heapUsedBytes);
 * ```
 */
export class DiagnosticBridge {
  private readonly cooldownMs: number;
  private lastTriggerMs = 0;
  private activeSession: HeapInvestigationSession | null = null;
  private readonly options: DiagnosticBridgeOptions;

  constructor(options: DiagnosticBridgeOptions = {}) {
    this.options = options;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  /**
   * Called when HighWaterMarkTracker detects a threshold breach.
   *
   * @param triggerReason - human-readable reason (e.g. 'high_water_mark')
   * @param heapUsedBytes - v8.getHeapStatistics().used_heap_size at trigger time
   */
  onThresholdExceeded(triggerReason: string, heapUsedBytes: number): void {
    const now = Date.now();

    // Debounce: suppress rapid re-triggers during GC pressure
    if (now - this.lastTriggerMs < this.cooldownMs) {
      return;
    }

    // Only one investigation at a time
    if (this.activeSession !== null) {
      return;
    }

    this.lastTriggerMs = now;

    const trigger: HdslTrigger = {
      type: 'threshold',
      reason: triggerReason,
      heap_used_bytes: heapUsedBytes,
      triggered_at_ms: now,
    };

    const session = new HeapInvestigationSession(
      trigger,
      this.options.investigationOptions,
      this.options.onProgress,
    );
    this.activeSession = session;

    session
      .run()
      .then((report) => {
        this.activeSession = null;
        this.options.onReport?.(report);
      })
      .catch((err: unknown) => {
        this.activeSession = null;
        this.options.onError?.(
          err instanceof Error ? err : new Error(String(err)),
        );
      });
  }

  /**
   * Manually triggers an investigation (user-initiated path).
   * Bypasses the cooldown debounce.
   */
  async triggerManual(reason: string = 'manual'): Promise<HdslReport> {
    // Abort any running session
    this.activeSession?.abort();
    this.activeSession = null;

    const trigger: HdslTrigger = {
      type: 'manual',
      reason,
      heap_used_bytes: 0,
      triggered_at_ms: Date.now(),
    };

    const session = new HeapInvestigationSession(
      trigger,
      this.options.investigationOptions,
      this.options.onProgress,
    );
    this.activeSession = session;

    try {
      const report = await session.run();
      this.options.onReport?.(report);
      return report;
    } finally {
      this.activeSession = null;
    }
  }

  /** Aborts any currently running investigation */
  abort(): void {
    this.activeSession?.abort();
    this.activeSession = null;
  }

  /** Returns true if an investigation is currently running */
  get isRunning(): boolean {
    return this.activeSession !== null;
  }

  /**
   * Resets the cooldown timer (useful in tests to simulate rapid triggers).
   */
  resetCooldown(): void {
    this.lastTriggerMs = 0;
  }
}
