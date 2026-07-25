/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

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
}
