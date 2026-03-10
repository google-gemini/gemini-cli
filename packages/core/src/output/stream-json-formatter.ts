/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  JsonStreamEvent,
  ModelStreamStats,
  StreamStats,
} from './types.js';
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
   * Includes per-model token breakdowns and aggregated totals.
   * @param metrics - The session metrics from telemetry
   * @param durationMs - The session duration in milliseconds
   * @returns Simplified stats for streaming output
   */
  convertToStreamStats(
    metrics: SessionMetrics,
    durationMs: number,
  ): StreamStats {
    const { totalTokens, inputTokens, outputTokens, cached, input, models } =
      Object.entries(metrics.models).reduce(
        (acc, [modelName, modelMetrics]) => {
          const modelStats: ModelStreamStats = {
            total_tokens: modelMetrics.tokens.total,
            input_tokens: modelMetrics.tokens.prompt,
            output_tokens: modelMetrics.tokens.candidates,
            cached: modelMetrics.tokens.cached,
            input: modelMetrics.tokens.input,
          };

          acc.models[modelName] = modelStats;
          acc.totalTokens += modelStats.total_tokens;
          acc.inputTokens += modelStats.input_tokens;
          acc.outputTokens += modelStats.output_tokens;
          acc.cached += modelStats.cached;
          acc.input += modelStats.input;

          return acc;
        },
        {
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cached: 0,
          input: 0,
          models: {} as Record<string, ModelStreamStats>,
        },
      );

    return {
      total_tokens: totalTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached,
      input,
      duration_ms: durationMs,
      tool_calls: metrics.tools.totalCalls,
      models,
    };
  }
}
