/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Scorer, AgentTrace, ScorerResult } from './scorer.js';

export interface LatencyScorerOptions {
  /**
   * Maximum acceptable first-token latency in milliseconds.
   * Defaults to 5 000 ms.
   */
  maxFirstTokenMs?: number;
  /**
   * Maximum acceptable total response latency in milliseconds.
   * Defaults to 30 000 ms.
   */
  maxTotalMs?: number;
}

/**
 * Scorer that records and gates on response latency.
 *
 * - `pass` if both first-token and total latency are within configured thresholds.
 * - `score` is a linear value in [0, 1]: 1 = under half the threshold,
 *   0 = at or over the threshold.
 *
 * Latency data is populated from `LoggingContentGenerator` timing events and
 * stored on the `AgentTrace` object by the eval harness.
 */
export class LatencyScorer implements Scorer {
  private readonly maxFirstTokenMs: number;
  private readonly maxTotalMs: number;

  constructor(options: LatencyScorerOptions = {}) {
    this.maxFirstTokenMs = options.maxFirstTokenMs ?? 5_000;
    this.maxTotalMs = options.maxTotalMs ?? 30_000;
  }

  async score(trace: AgentTrace): Promise<ScorerResult> {
    const first = trace.firstTokenLatencyMs;
    const total = trace.totalLatencyMs;

    if (first === undefined || total === undefined) {
      return {
        scorer: 'latency',
        pass: true,
        score: 1,
        reason: 'Latency data not available — skipping latency check.',
      };
    }

    const firstOk = first <= this.maxFirstTokenMs;
    const totalOk = total <= this.maxTotalMs;
    const pass = firstOk && totalOk;

    // score: 1 = at 0 ms, 0 = at maxTotalMs, linear interpolation
    const score = Math.max(0, 1 - total / this.maxTotalMs);
    const parts: string[] = [];
    if (!firstOk)
      parts.push(
        `First-token latency ${first}ms exceeds limit ${this.maxFirstTokenMs}ms`,
      );
    if (!totalOk)
      parts.push(`Total latency ${total}ms exceeds limit ${this.maxTotalMs}ms`);

    return {
      scorer: 'latency',
      pass,
      score,
      reason: pass
        ? `First-token ${first}ms, total ${total}ms — within limits.`
        : parts.join('. '),
    };
  }
}
