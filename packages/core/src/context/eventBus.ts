/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { ConcreteNode } from './graph/types.js';

export interface PristineHistoryUpdatedEvent {
  nodes: readonly ConcreteNode[];
  newNodes: Set<string>;
}

export interface ContextConsolidationEvent {
  nodes: readonly ConcreteNode[];
  targetDeficit: number;
  targetNodeIds: Set<string>;
}

export interface ChunkReceivedEvent {
  nodes: readonly ConcreteNode[];
  targetNodeIds: Set<string>;
}

export class ContextEventBus extends EventEmitter {
  emitPristineHistoryUpdated(event: PristineHistoryUpdatedEvent) {
    this.emit('PRISTINE_HISTORY_UPDATED', event);
  }

  onPristineHistoryUpdated(
    listener: (event: PristineHistoryUpdatedEvent) => void,
  ) {
    this.on('PRISTINE_HISTORY_UPDATED', listener);
  }

  emitChunkReceived(event: ChunkReceivedEvent) {
    this.emit('IR_CHUNK_RECEIVED', event);
  }

  onChunkReceived(listener: (event: ChunkReceivedEvent) => void) {
    this.on('IR_CHUNK_RECEIVED', listener);
  }

  emitConsolidationNeeded(event: ContextConsolidationEvent) {
    this.emit('BUDGET_RETAINED_CROSSED', event);
  }

  onConsolidationNeeded(listener: (event: ContextConsolidationEvent) => void) {
    this.on('BUDGET_RETAINED_CROSSED', listener);
  }
}
