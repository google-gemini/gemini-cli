/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcreteNode } from './ir/types.js';

export interface SnapshotProposal {
  id: string;
  newText: string;
  consumedIds: string[];
  type: string;
  timestamp: number;
}

export interface SnapshotCache {
  getProposals(): ReadonlyArray<SnapshotProposal>;
  consume(id: string): void;
  publish(proposal: Omit<SnapshotProposal, 'id' | 'timestamp'>, idGenerator: { generateId(): string }): void;
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
  readonly snapshotCache: SnapshotCache;
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
