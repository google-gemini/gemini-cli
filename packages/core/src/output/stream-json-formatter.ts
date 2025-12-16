/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { JsonStreamEvent, StreamStats } from './types.js';
import type { SessionMetrics } from '../telemetry/uiTelemetry.js';

/**
 * Formatter for streaming JSON output.
 * Emits newline-delimited JSON (JSONL) events to stdout in real-time.
 */
export class StreamJsonFormatter {
  /**
   * Formats a single event as a JSON string with newline (JSONL format).
   * @param event - The stream event to format
   * @returns JSON string with trailing newline
   */
  formatEvent(event: JsonStreamEvent): string {
    return JSON.stringify(event) + '\n';
  }

  /**
   * Emits an event directly to stdout in JSONL format.
   * @param event - The stream event to emit
   */
  emitEvent(event: JsonStreamEvent): void {
    process.stdout.write(this.formatEvent(event));
  }

  /**
   * Converts SessionMetrics to simplified StreamStats format.
   * Aggregates token counts across all models.
   * @param metrics - The session metrics from telemetry
   * @param durationMs - The session duration in milliseconds
   * @returns Simplified stats for streaming output
   */
  convertToStreamStats(
    metrics: SessionMetrics,
    durationMs: number,
  ): StreamStats {
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cached = 0;
    let input = 0;

    // Aggregate token counts across all models
    for (const modelMetrics of Object.values(metrics.models)) {
      totalTokens += modelMetrics.tokens.total;
      inputTokens += modelMetrics.tokens.prompt;
      outputTokens += modelMetrics.tokens.candidates;
      cached += modelMetrics.tokens.cached;
      input += modelMetrics.tokens.input;
    }

    return {
      total_tokens: totalTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached,
      input,
      duration_ms: durationMs,
      tool_calls: metrics.tools.totalCalls,
    };
  }
}
