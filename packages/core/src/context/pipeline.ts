/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from './ir/types.js';

export interface InboxMessage<T = unknown> {
  id: string;
  topic: string;
  payload: T;
  timestamp: number;
}

export interface InboxSnapshot {
  getMessages<T = unknown>(topic: string): ReadonlyArray<InboxMessage<T>>;
  consume(messageId: string): void;
}

export interface ContextWorkingBuffer {
  readonly nodes: readonly ConcreteNode[];
  getPristineNode(id: string): ConcreteNode | undefined;
  getLineage(id: string): readonly ConcreteNode[];
}

export interface ContextAccountingState {
  readonly currentTokens: number;
  readonly maxTokens: number;
  readonly retainedTokens: number;
  readonly deficitTokens: number;
  readonly protectedLogicalIds: ReadonlySet<string>;
  readonly isBudgetSatisfied: boolean;
}

export interface ProcessArgs {
  readonly buffer: ContextWorkingBuffer;
  readonly targets: readonly ConcreteNode[];
  readonly state: ContextAccountingState;
  readonly inbox: InboxSnapshot;
}

export interface ContextProcessor {
  readonly id: string;
  readonly name: string;
  process(args: ProcessArgs): Promise<readonly ConcreteNode[]>;
}

export interface ContextWorker {
  readonly id: string;
  readonly name: string;
  readonly triggers: {
    onNodesAdded?: boolean;
    onInboxTopics?: string[];
  };
  execute(args: {
    targets: ReadonlyArray<ConcreteNode>;
    inbox: InboxSnapshot;
  }): Promise<void>;
}

export interface BackstopTargetOptions {
  target?: 'incremental' | 'freeNTokens' | 'max';
  freeTokensTarget?: number;
}
