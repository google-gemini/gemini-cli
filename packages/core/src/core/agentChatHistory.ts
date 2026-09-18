/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import { isInterruptionContent } from '../utils/interruptionSanitizer.js';

/**
 * A durable wrapper for Gemini Content that carries a stable ID.
 * This ID is preserved across all transformations and is used as the anchor
 * for context graph node identity.
 */
export interface HistoryTurn {
  readonly id: string;
  readonly content: Content;
}

/**
 * The 'Strong Owner' of chat history turns.
 * It ensures that every turn in the session is associated with a durable ID.
 */
export class AgentChatHistory {
  private history: HistoryTurn[] = [];

  constructor(initialTurns: HistoryTurn[] = []) {
    this.history = [...initialTurns];
  }

  /**
   * Adds a new turn to the history.
   * Every turn must have a durable ID, usually provided by the ChatRecordingService.
   */
  push(turn: HistoryTurn) {
    this.history.push(turn);
  }

  /**
   * Overwrites the entire history with a new list of turns.
   */
  set(turns: readonly HistoryTurn[]) {
    this.history = [...turns];
  }

  clear() {
    this.history = [];
  }

  /**
   * Rolls back the history to a specified length.
   * Useful when a stream fails and we need to remove the un-responded turn(s).
   */
  rollback(length: number) {
    if (length >= 0 && length <= this.history.length) {
      this.history = this.history.slice(0, length);
    }
  }

  get(): readonly HistoryTurn[] {
    return this.history;
  }

  /**
   * Returns a copy of the raw Gemini Content[] for API consumption.
   */
  getContents(): Content[] {
    return this.history.map((h) => h.content);
  }

  map<U>(
    callback: (value: HistoryTurn, index: number, array: HistoryTurn[]) => U,
  ): U[] {
    return this.history.map(callback);
  }

  flatMap<U>(
    callback: (
      value: HistoryTurn,
      index: number,
      array: HistoryTurn[],
    ) => U | readonly U[],
  ): U[] {
    return this.history.flatMap(callback);
  }

  get length(): number {
    return this.history.length;
  }

  /**
   * Returns `true` if any model turn in the history contains the raw
   * interruption placeholder text that causes session context poisoning.
   *
   * This is a diagnostic helper for debugging and assertions — the actual
   * sanitization happens in `extractCuratedHistory()` and the scrub pipeline.
   */
  containsInterruptionPlaceholder(): boolean {
    return this.history.some(
      (turn) =>
        turn.content.role === 'model' && isInterruptionContent(turn.content),
    );
  }

  /**
   * Returns the last model turn, or `undefined` if there is none.
   * Useful for quick inspection without copying the whole history array.
   */
  getLastModelTurn(): HistoryTurn | undefined {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].content.role === 'model') {
        return this.history[i];
      }
    }
    return undefined;
  }
}
