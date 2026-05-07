/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

export type HistoryEventType = 'PUSH' | 'SYNC_FULL' | 'CLEAR' | 'SILENT_SYNC';

export interface HistoryEvent {
  type: HistoryEventType;
  payload: readonly Content[];
}

export type HistoryListener = (event: HistoryEvent) => void;

export class AgentChatHistory {
  private history: Content[];
  private listeners: Set<HistoryListener> = new Set();

  constructor(initialHistory: Content[] = []) {
    this.history = [...initialHistory];
  }

  subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    // Emit initial state to new subscriber
    listener({ type: 'SYNC_FULL', payload: this.history });
    return () => this.listeners.delete(listener);
  }

  private notify(type: HistoryEventType, payload: readonly Content[]) {
    const event: HistoryEvent = { type, payload };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  push(content: Content) {
    this.history.push(content);
    this.notify('PUSH', [content]);
  }

  set(history: readonly Content[], options: { silent?: boolean } = {}) {
    this.history = [...history];
    this.notify(options.silent ? 'SILENT_SYNC' : 'SYNC_FULL', this.history);
  }

  clear() {
    this.history = [];
    this.notify('CLEAR', []);
  }

  get(): readonly Content[] {
    return this.history;
  }

  map(callback: (value: Content, index: number, array: Content[]) => Content) {
    this.history = this.history.map(callback);
    this.notify('SYNC_FULL', this.history);
  }

  flatMap<U>(
    callback: (
      value: Content,
      index: number,
      array: Content[],
    ) => U | readonly U[],
  ): U[] {
    return this.history.flatMap(callback);
  }

  get length(): number {
    return this.history.length;
  }
}
