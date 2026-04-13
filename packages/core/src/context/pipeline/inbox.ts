/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { InboxMessage, InboxSnapshot } from '../pipeline.js';

export class LiveInbox {
  private messages: InboxMessage[] = [];

  publish<T>(topic: string, payload: T): void {
    this.messages.push({
      id: randomUUID(),
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
    /*
     * Architectural Justification for Unchecked Cast:
     * The Inbox is a heterogeneous event bus designed to support arbitrary, declarative
     * routing via configuration files (where topics are just strings). Because TypeScript
     * completely erases generic type information (<T>) at runtime, the central array
     * can only hold `unknown` payloads. To enforce strict type safety without a central
     * registry (which would break decoupling) or heavy runtime validation (Zod schemas),
     * we must assert the type boundary here. The contract relies on the async pipeline and Processor
     * agreeing on the payload structure associated with the configured topic string.
     */
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
