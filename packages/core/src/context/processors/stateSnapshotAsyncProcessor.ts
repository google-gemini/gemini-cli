/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { JSONSchemaType } from 'ajv';
import type { AsyncContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import {
  SnapshotGenerator,
  findLatestSnapshotBaseline,
} from '../utils/snapshotGenerator.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { NodeType } from '../graph/types.js';

export interface StateSnapshotAsyncProcessorOptions {
  type?: 'accumulate' | 'point-in-time';
  systemInstruction?: string;
  maxSummaryTurns?: number;
  maxStateTokens?: number;
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
      maxSummaryTurns: { type: 'number', nullable: true },
      maxStateTokens: { type: 'number', nullable: true },
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
        let previousConsumedIds: string[] = [];
        const processorType = options.type ?? 'point-in-time';
        const nodesToSummarize = [...targets];
        let previousStateJson: string | undefined = undefined;

        if (processorType === 'accumulate') {
          // 1. Look for the most recent unconsumed accumulate snapshot in the inbox
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
            previousStateJson = latest.payload.newText;
          } else {
            // 2. Global Lookback: No draft in inbox, scan the context graph for the last live snapshot
            const baseline = findLatestSnapshotBaseline(targets);

            if (baseline) {
              previousStateJson = baseline.text;
              previousConsumedIds = [...baseline.abstractsIds];
            } else {
              debugLogger.log(
                '[StateSnapshotAsyncProcessor] No previous snapshot found in Inbox or Graph. Initializing new Master State baseline in background.',
              );
            }
          }
        }

        // If the snapshot happens to be inside our summary window, remove it so the LLM doesn't read it as raw transcript
        if (previousStateJson) {
          const summaryIdx = nodesToSummarize.findIndex(
            (n) =>
              n.type === NodeType.SNAPSHOT &&
              n.payload.text === previousStateJson,
          );
          if (summaryIdx !== -1) {
            nodesToSummarize.splice(summaryIdx, 1);
          }
        }

        if (nodesToSummarize.length === 0) return;

        const snapshotText = await generator.synthesizeSnapshot(
          nodesToSummarize,
          previousStateJson,
          {
            maxSummaryTurns: options.maxSummaryTurns,
            maxStateTokens: options.maxStateTokens,
          },
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
          timestamp: targets[targets.length - 1].timestamp,
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
