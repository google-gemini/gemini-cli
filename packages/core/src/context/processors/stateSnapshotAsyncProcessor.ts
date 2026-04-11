/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { AsyncContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import type { ConcreteNode } from '../ir/types.js';
import { SnapshotGenerator } from '../utils/snapshotGenerator.js';
import { debugLogger } from '../../utils/debugLogger.js';

export interface StateSnapshotAsyncProcessorOptions {
  type?: 'accumulate' | 'point-in-time';
  systemInstruction?: string;
}

export function createStateSnapshotAsyncProcessor(
  id: string,
  env: ContextEnvironment,
  options: StateSnapshotAsyncProcessorOptions,
): AsyncContextProcessor {
  const generator = new SnapshotGenerator(env);

  return {
    id,
    name: 'StateSnapshotAsyncProcessor',
    process: async ({ targets, snapshotCache }: ProcessArgs): Promise<void> => {
      if (targets.length === 0) return;

      try {
        let nodesToSummarize = [...targets];
        let previousConsumedIds: string[] = [];
        const processorType = options.type ?? 'point-in-time';

        if (processorType === 'accumulate') {
          // Look for the most recent unconsumed accumulate snapshot in the cache
          const proposedSnapshots = snapshotCache.getProposals();
          const accumulateSnapshots = proposedSnapshots.filter(
            (s) => s.type === 'accumulate',
          );

          if (accumulateSnapshots.length > 0) {
            // Sort to find the most recent
            const latest = [...accumulateSnapshots].sort(
              (a, b) => b.timestamp - a.timestamp,
            )[0];

            // Consume the old draft so the cache doesn't fill up with stale drafts
            snapshotCache.consume(latest.id);

            previousConsumedIds = latest.consumedIds;

            // Prepend a synthetic node representing the previous rolling state
            const previousStateNode: ConcreteNode = {
              id: env.idGenerator.generateId(),
              logicalParentId: '',
              type: 'SNAPSHOT',
              timestamp: latest.timestamp,
              text: latest.newText,
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

        snapshotCache.publish(
          {
            newText: snapshotText,
            consumedIds: newConsumedIds,
            type: processorType,
          },
          env.idGenerator,
        );
      } catch (e) {
        debugLogger.error(
          'StateSnapshotAsyncProcessor failed to generate snapshot',
          e,
        );
      }
    },
  };
}
