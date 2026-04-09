/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { InboxMessage, InboxSnapshot } from '../pipeline.js';

export class LiveInbox {
  private messages: InboxMessage[] = [];

  publish<T>(topic: string, payload: T, idGenerator: { generateId(): string }): void {
    this.messages.push({
      id: idGenerator.generateId(),
      topic,
      payload,
      timestamp: Date.now(),
    });
  }

  getMessages(): readonly InboxMessage[] {
    return [...this.messages];
  }

  drainConsumed(consumedIds: Set<string>): void {
    this.messages = this.messages.filter((m) => !consumedIds.has(m.id));
  }
}

export class InboxSnapshotImpl implements InboxSnapshot {
  private messages: readonly InboxMessage[];
  private consumedIds = new Set<string>();

  constructor(messages: readonly InboxMessage[]) {
    this.messages = messages;
  }

  getMessages<T = unknown>(topic: string): ReadonlyArray<InboxMessage<T>> {
    const raw = this.messages.filter((m) => m.topic === topic);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return raw as ReadonlyArray<InboxMessage<T>>;
  }

  consume(messageId: string): void {
    this.consumedIds.add(messageId);
  }

  getConsumedIds(): Set<string> {
    return this.consumedIds;
  }
}
