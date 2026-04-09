/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextWorker, InboxSnapshot } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import type { ConcreteNode } from '../ir/types.js';
import { SnapshotGenerator } from '../utils/snapshotGenerator.js';
import { debugLogger } from '../../utils/debugLogger.js';

export interface StateSnapshotWorkerOptions {
  type?: 'accumulate' | 'point-in-time';
  systemInstruction?: string;
}

export class StateSnapshotWorker implements ContextWorker {
  static readonly schema = {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['accumulate', 'point-in-time'] },
      systemInstruction: { type: 'string' },
    },
  };

  static create(
    env: ContextEnvironment,
    options: StateSnapshotWorkerOptions,
  ): StateSnapshotWorker {
    return new StateSnapshotWorker(env, options);
  }

  readonly id = 'StateSnapshotWorker';
  readonly name = 'StateSnapshotWorker';
  readonly options: StateSnapshotWorkerOptions;
  private readonly env: ContextEnvironment;
  private readonly generator: SnapshotGenerator;

  // Triggers when nodes exceed retained threshold (via retained_exceeded in Orchestrator)
  readonly triggers = {
    onNodesAgedOut: true,
  };

  constructor(env: ContextEnvironment, options: StateSnapshotWorkerOptions) {
    this.env = env;
    this.options = options;
    this.generator = new SnapshotGenerator(env);
  }

  async execute({ targets, inbox }: { targets: readonly ConcreteNode[]; inbox: InboxSnapshot }): Promise<void> {
    if (targets.length === 0) return;

    try {
      let nodesToSummarize = [...targets];
      let previousConsumedIds: string[] = [];
      const workerType = this.options.type ?? 'point-in-time';

      if (workerType === 'accumulate') {
        // Look for the most recent unconsumed accumulate snapshot in the inbox
        const proposedSnapshots = inbox.getMessages<{ newText: string; consumedIds: string[]; type: string }>('PROPOSED_SNAPSHOT');
        const accumulateSnapshots = proposedSnapshots.filter(s => s.payload.type === 'accumulate');
        
        if (accumulateSnapshots.length > 0) {
          // Sort to find the most recent
          const latest = [...accumulateSnapshots].sort((a, b) => b.timestamp - a.timestamp)[0];
          
          // Consume the old draft so the inbox doesn't fill up with stale drafts
          inbox.consume(latest.id);
          // And we must persist its consumption back to the live inbox immediately, 
          // because we are effectively "taking" it from the shelf to modify.
          this.env.inbox.drainConsumed(new Set([latest.id]));

          previousConsumedIds = latest.payload.consumedIds;

          // Prepend a synthetic node representing the previous rolling state
          const previousStateNode: ConcreteNode = {
            id: this.env.idGenerator.generateId(),
            logicalParentId: '',
            type: 'SNAPSHOT',
            timestamp: latest.timestamp,
            text: latest.payload.newText,
          } as import('../ir/types.js').Snapshot;

          nodesToSummarize = [previousStateNode, ...targets];
        }
      }

      const snapshotText = await this.generator.synthesizeSnapshot(
        nodesToSummarize,
        this.options.systemInstruction,
      );

      const newConsumedIds = [...previousConsumedIds, ...targets.map((t) => t.id)];

      // In V2, workers communicate their work to the inbox, and the processor picks it up.
      this.env.inbox.publish('PROPOSED_SNAPSHOT', {
        newText: snapshotText,
        consumedIds: newConsumedIds,
        type: workerType,
      }, this.env.idGenerator);

    } catch (e) {
      debugLogger.error('StateSnapshotWorker failed to generate snapshot', e);
    }
  }
}
