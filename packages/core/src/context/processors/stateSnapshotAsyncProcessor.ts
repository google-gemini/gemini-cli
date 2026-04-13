/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type { AsyncContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import type { ConcreteNode } from '../graph/types.js';
import { SnapshotGenerator } from '../utils/snapshotGenerator.js';
import { debugLogger } from '../../utils/debugLogger.js';

export interface StateSnapshotAsyncProcessorOptions {
  type?: 'accumulate' | 'point-in-time';
  systemInstruction?: string;
}

export const StateSnapshotAsyncProcessorOptionsSchema: JSONSchemaType<StateSnapshotAsyncProcessorOptions> =
  {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['accumulate', 'point-in-time'],
        nullable: true,
      },
      systemInstruction: { type: 'string', nullable: true },
    },
    required: [],
  };

export function createStateSnapshotAsyncProcessor(
  id: string,
  env: ContextEnvironment,
  options: StateSnapshotAsyncProcessorOptions,
): AsyncContextProcessor {
  const generator = new SnapshotGenerator(env);

  return {
    id,
    name: 'StateSnapshotAsyncProcessor',
    process: async ({ targets, inbox }: ProcessArgs): Promise<void> => {
      if (targets.length === 0) return;

      try {
        let nodesToSummarize = [...targets];
        let previousConsumedIds: string[] = [];
        const processorType = options.type ?? 'point-in-time';

        if (processorType === 'accumulate') {
          // Look for the most recent unconsumed accumulate snapshot in the inbox
          const proposedSnapshots = inbox.getMessages<{
            newText: string;
            consumedIds: string[];
            type: string;
          }>('PROPOSED_SNAPSHOT');
          const accumulateSnapshots = proposedSnapshots.filter(
            (s) => s.payload.type === 'accumulate',
          );

          if (accumulateSnapshots.length > 0) {
            // Sort to find the most recent
            const latest = [...accumulateSnapshots].sort(
              (a, b) => b.timestamp - a.timestamp,
            )[0];

            // Consume the old draft so the inbox doesn't fill up with stale drafts
            inbox.consume(latest.id);
            // And we must persist its consumption back to the live inbox immediately,
            // because we are effectively "taking" it from the shelf to modify.
            env.inbox.drainConsumed(new Set([latest.id]));

            previousConsumedIds = latest.payload.consumedIds;

            // Prepend a synthetic node representing the previous rolling state
            const previousStateNode: ConcreteNode = {
              id: randomUUID(),
              logicalParentId: '',
              type: 'SNAPSHOT',
              timestamp: latest.timestamp,
              text: latest.payload.newText,
            };

            nodesToSummarize = [previousStateNode, ...targets];
          }
        }

        const snapshotText = await generator.synthesizeSnapshot(
          nodesToSummarize,
          options.systemInstruction,
        );

        const newConsumedIds = [
          ...previousConsumedIds,
          ...targets.map((t) => t.id),
        ];

        // In V2, async pipelines communicate their work to the inbox, and the processor picks it up.
        env.inbox.publish('PROPOSED_SNAPSHOT', {
          newText: snapshotText,
          consumedIds: newConsumedIds,
          type: processorType,
        });
      } catch (e) {
        debugLogger.error(
          'StateSnapshotAsyncProcessor failed to generate snapshot',
          e,
        );
      }
    },
  };
}
