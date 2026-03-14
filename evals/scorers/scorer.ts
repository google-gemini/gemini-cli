/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A single recorded tool invocation from an agent session.
 */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
}

/**
 * A complete trace of one agent turn — the unit of analysis for all scorers.
 * Populated from `ChatRecordingService` session JSON and `LoggingContentGenerator`
 * timing events.
 */
export interface AgentTrace {
  /** The original user prompt that triggered this turn. */
  prompt: string;
  /** The model's final text response. */
  finalResponse: string;
  /** All tool calls made during this turn, in order. */
  toolCalls: ToolCall[];
  /** Wall-clock ms from request start to first streamed token. */
  firstTokenLatencyMs?: number;
  /** Wall-clock ms from request start to final token. */
  totalLatencyMs?: number;
  /** Name of the model that produced this response. */
  model?: string;
}

/**
 * The result produced by a {@link Scorer} for one {@link AgentTrace}.
 */
export interface ScorerResult {
  /** Human-readable scorer name e.g. `'tool_call_accuracy'`. */
  scorer: string;
  /** Whether this trace passed the scorer's threshold. */
  pass: boolean;
  /** Numeric quality score in [0, 1]. */
  score: number;
  /** Short explanation of the verdict. */
  reason: string;
}

/**
 * Strategy interface for behavioral evaluation scorers.
 *
 * Every scorer — whether deterministic (ToolCallAccuracy) or model-based
 * (LlmJudge) — implements this contract. Scorers are injected as an array
 * into the eval runner; no switch/if on scorer type is needed.
 *
 * @example
 * ```ts
 * const scorers: Scorer[] = [
 *   new ToolCallAccuracyScorer({ expected: ['read_file'] }),
 *   new LlmJudgeScorer('Does the answer reference calculateFibonacci?', generator),
 * ];
 * const results = await Promise.all(scorers.map(s => s.score(trace)));
 * ```
 */
export interface Scorer {
  /**
   * Evaluates an {@link AgentTrace} and returns a {@link ScorerResult}.
   * Must never throw — return `pass: false` with a reason on error.
   */
  score(trace: AgentTrace): Promise<ScorerResult>;
}
