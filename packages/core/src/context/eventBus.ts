/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type { Episode, Variant } from './ir/types.js';

export interface PristineHistoryUpdatedEvent {
  episodes: Episode[];
  newNodes: Set<string>;
}

export interface ContextConsolidationEvent {
  episodes: Episode[];
  targetDeficit: number;
  targetNodeIds: Set<string>;
}

export interface IrChunkReceivedEvent {
  episodes: Episode[];
  targetNodeIds: Set<string>;
}

export interface VariantReadyEvent {
  targetId: string; // The Episode or Step ID this variant attaches to
  variantId: string; // A unique ID for the variant itself
  variant: Variant;
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

  emitChunkReceived(event: IrChunkReceivedEvent) {
    this.emit('IR_CHUNK_RECEIVED', event);
  }

  onChunkReceived(listener: (event: IrChunkReceivedEvent) => void) {
    this.on('IR_CHUNK_RECEIVED', listener);
  }

  emitConsolidationNeeded(event: ContextConsolidationEvent) {
    this.emit('BUDGET_RETAINED_CROSSED', event);
  }

  onConsolidationNeeded(listener: (event: ContextConsolidationEvent) => void) {
    this.on('BUDGET_RETAINED_CROSSED', listener);
  }

  emitVariantReady(event: VariantReadyEvent) {
    this.emit('VARIANT_READY', event);
  }

  onVariantReady(listener: (event: VariantReadyEvent) => void) {
    this.on('VARIANT_READY', listener);
  }
}
