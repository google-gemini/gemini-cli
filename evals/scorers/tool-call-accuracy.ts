/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Scorer, AgentTrace, ScorerResult } from './scorer.js';

export interface ToolCallAccuracyOptions {
  /**
   * Tool names that MUST appear in the trace's tool call list.
   * Defaults to [] (no required tools).
   */
  requiredTools?: string[];
  /**
   * Tool names that MUST NOT appear in the trace's tool call list.
   * Useful for proving RAG pre-injection removed the need for a read_file call.
   * Defaults to [] (no forbidden tools).
   */
  forbiddenTools?: string[];
}

/**
 * Deterministic scorer that checks which tools were (or were not) invoked.
 *
 * - `score = 1.0` → all required tools present AND no forbidden tools present
 * - `score = 0.0` → any violation
 *
 * This is the Strategy-pattern implementation for binary tool-use checks.
 */
export class ToolCallAccuracyScorer implements Scorer {
  private readonly required: string[];
  private readonly forbidden: string[];

  constructor(options: ToolCallAccuracyOptions = {}) {
    this.required = options.requiredTools ?? [];
    this.forbidden = options.forbiddenTools ?? [];
  }

  async score(trace: AgentTrace): Promise<ScorerResult> {
    const called = new Set(trace.toolCalls.map((t) => t.name));
    const missing = this.required.filter((t) => !called.has(t));
    const unexpected = this.forbidden.filter((t) => called.has(t));

    const pass = missing.length === 0 && unexpected.length === 0;
    const parts: string[] = [];
    if (missing.length > 0)
      parts.push(`Missing required tools: ${missing.join(', ')}`);
    if (unexpected.length > 0)
      parts.push(`Forbidden tools were called: ${unexpected.join(', ')}`);

    return {
      scorer: 'tool_call_accuracy',
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'All tool-use constraints satisfied.' : parts.join('. '),
    };
  }
}
