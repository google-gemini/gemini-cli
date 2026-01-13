/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OpenAIToolCallDelta, OpenAIToolCall } from './types.js';

/**
 * Accumulates tool call deltas from streaming responses.
 *
 * OpenAI streaming sends tool calls as deltas where:
 * - First delta has id, type, and function.name
 * - Subsequent deltas have function.arguments (may be partial JSON)
 *
 * This class reassembles complete tool calls from these deltas.
 */
export class ToolCallAccumulator {
  private toolCalls: Map<number, PartialToolCall> = new Map();

  /**
   * Add a tool call delta to the accumulator.
   */
  addDelta(delta: OpenAIToolCallDelta): void {
    const existing = this.toolCalls.get(delta.index) ?? {
      id: '',
      type: 'function' as const,
      function: { name: '', arguments: '' },
    };

    if (delta.id) {
      existing.id = delta.id;
    }
    if (delta.type) {
      existing.type = delta.type;
    }

    if (delta.function) {
      if (delta.function.name) {
        existing.function.name = delta.function.name;
      }
      if (delta.function.arguments) {
        existing.function.arguments += delta.function.arguments;
      }
    }

    this.toolCalls.set(delta.index, existing);
  }

  /**
   * Get all accumulated tool calls.
   * Returns only complete tool calls (with id and function name).
   */
  getCompletedToolCalls(): OpenAIToolCall[] {
    return Array.from(this.toolCalls.values()).filter(
      (tc): tc is OpenAIToolCall => !!tc.id && !!tc.function?.name,
    );
  }

  /**
   * Check if any tool calls are being accumulated.
   */
  hasToolCalls(): boolean {
    return this.toolCalls.size > 0;
  }

  /**
   * Clear all accumulated tool calls.
   */
  clear(): void {
    this.toolCalls.clear();
  }
}

interface PartialToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
