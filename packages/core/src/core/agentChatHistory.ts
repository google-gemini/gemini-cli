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

export type HistoryEventType = 'PUSH' | 'SYNC_FULL' | 'CLEAR' | 'SILENT_SYNC';

export interface HistoryEvent {
  type: HistoryEventType;
  payload: readonly HistoryTurn[];
}

export type HistoryListener = (event: HistoryEvent) => void;

/**
 * The 'Strong Owner' of chat history turns.
 * It ensures that every turn in the session is associated with a durable ID.
 */
export class AgentChatHistory {
  private history: HistoryTurn[] = [];
  private listeners: Set<HistoryListener> = new Set();

  constructor(initialTurns: HistoryTurn[] = []) {
    this.history = [...initialTurns];
  }

  subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    // Emit initial state to new subscriber
    listener({ type: 'SYNC_FULL', payload: this.history });
    return () => this.listeners.delete(listener);
  }

  private notify(type: HistoryEventType, payload: readonly HistoryTurn[]) {
    const event: HistoryEvent = { type, payload };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Adds a new turn to the history.
   * Every turn must have a durable ID, usually provided by the ChatRecordingService.
   */
  push(turn: HistoryTurn) {
    this.history.push(turn);
    this.notify('PUSH', [turn]);
  }

  /**
   * Overwrites the entire history with a new list of turns.
   */
  set(turns: readonly HistoryTurn[], options: { silent?: boolean } = {}) {
    this.history = [...turns];
    this.notify(options.silent ? 'SILENT_SYNC' : 'SYNC_FULL', this.history);
  }

  clear() {
    this.history = [];
    this.notify('CLEAR', []);
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
