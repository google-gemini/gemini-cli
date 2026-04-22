/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from './graph/types.js';

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

export interface GraphMutation {
  readonly processorId: string;
  readonly timestamp: number;
  readonly removedIds: readonly string[];
  readonly addedNodes: readonly ConcreteNode[];
}

export interface ContextWorkingBuffer {
  readonly nodes: readonly ConcreteNode[];
  getPristineNodes(id: string): readonly ConcreteNode[];
  getLineage(id: string): readonly ConcreteNode[];
  getAuditLog(): readonly GraphMutation[];
}

export interface ProcessArgs {
  readonly buffer: ContextWorkingBuffer;
  readonly targets: readonly ConcreteNode[];
  readonly inbox: InboxSnapshot;
}

/**
 * A ContextProcessor is a pure, closure-based object that returns a modified subset of nodes
 * (or the original targets if no changes are needed).
 * The Orchestrator will use this to generate a new graph delta.
 */
export interface ContextProcessor {
  readonly id: string;
  readonly name: string;
  process(args: ProcessArgs): Promise<readonly ConcreteNode[]>;
}

export interface AsyncContextProcessor {
  readonly id: string;
  readonly name: string;
  process(args: ProcessArgs): Promise<void>;
}

export interface BackstopTargetOptions {
  target?: 'incremental' | 'freeNTokens' | 'max';
  freeTokensTarget?: number;
}
