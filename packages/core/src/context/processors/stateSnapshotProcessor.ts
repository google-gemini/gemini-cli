/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type {
  ContextProcessor,
  ProcessArgs,
  BackstopTargetOptions,
} from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import type { ConcreteNode, Snapshot } from '../graph/types.js';
import { SnapshotGenerator } from '../utils/snapshotGenerator.js';
import { debugLogger } from '../../utils/debugLogger.js';

export interface StateSnapshotProcessorOptions extends BackstopTargetOptions {
  model?: string;
  systemInstruction?: string;
}

export const StateSnapshotProcessorOptionsSchema: JSONSchemaType<StateSnapshotProcessorOptions> =
  {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['incremental', 'freeNTokens', 'max'],
        nullable: true,
      },
      freeTokensTarget: { type: 'number', nullable: true },
      model: { type: 'string', nullable: true },
      systemInstruction: { type: 'string', nullable: true },
    },
    required: [],
  };

export function createStateSnapshotProcessor(
  id: string,
  env: ContextEnvironment,
  options: StateSnapshotProcessorOptions,
): ContextProcessor {
  const generator = new SnapshotGenerator(env);

  return {
    id,
    name: 'StateSnapshotProcessor',
    process: async ({ targets, inbox }: ProcessArgs) => {
      if (targets.length === 0) {
        return targets;
      }

      // Determine what mode we are looking for: 'incremental' -> 'point-in-time', 'max' -> 'accumulate'
      const strategy = options.target ?? 'max';
      const expectedType =
        strategy === 'incremental' ? 'point-in-time' : 'accumulate';

      // 1. Check Inbox for a completed Snapshot (The Fast Path)
      const proposedSnapshots = inbox.getMessages<{
        newText: string;
        consumedIds: string[];
        type: string;
      }>('PROPOSED_SNAPSHOT');

      if (proposedSnapshots.length > 0) {
        // Filter for the snapshot type that matches our processor mode
        const matchingSnapshots = proposedSnapshots.filter(
          (s) => s.payload.type === expectedType,
        );

        // Sort by newest timestamp first (we want the most accumulated snapshot)
        const sorted = [...matchingSnapshots].sort(
          (a, b) => b.timestamp - a.timestamp,
        );

        for (const proposed of sorted) {
          const { consumedIds, newText } = proposed.payload;

          // Verify all consumed IDs still exist sequentially in targets
          const targetIds = new Set(targets.map((t) => t.id));
          const isValid = consumedIds.every((id) => targetIds.has(id));

          if (isValid) {
            // If valid, apply it!
            const newId = randomUUID();

            const snapshotNode: Snapshot = {
              id: newId,
              logicalParentId: newId,
              type: 'SNAPSHOT',
              timestamp: Date.now(),
              text: newText,
              abstractsIds: consumedIds,
            };

            // Remove the consumed nodes and insert the snapshot at the earliest index
            const returnedNodes = targets.filter(
              (t) => !consumedIds.includes(t.id),
            );
            const firstRemovedIdx = targets.findIndex((t) =>
              consumedIds.includes(t.id),
            );

            if (firstRemovedIdx !== -1) {
              const idx = Math.max(0, firstRemovedIdx);
              returnedNodes.splice(idx, 0, snapshotNode);
            } else {
              returnedNodes.unshift(snapshotNode);
            }

            inbox.consume(proposed.id);
            return returnedNodes;
          }
        }
      }

      // 2. The Synchronous Backstop (The Slow Path)
      let targetTokensToRemove = 0;

      if (strategy === 'incremental') {
        targetTokensToRemove = Infinity; // incremental implies removing as much as possible if no state is passed
      } else if (strategy === 'freeNTokens') {
        targetTokensToRemove = options.freeTokensTarget ?? Infinity;
      } else if (strategy === 'max') {
        targetTokensToRemove = Infinity;
      }

      let deficitAccumulator = 0;
      const nodesToSummarize: ConcreteNode[] = [];

      // Scan oldest to newest
      for (const node of targets) {
        if (node.id === targets[0].id && node.type === 'USER_PROMPT') {
          // Keep system prompt if it's the very first node
          // In a real system, system prompt is protected, but we double check
          continue;
        }

        nodesToSummarize.push(node);
        deficitAccumulator += env.tokenCalculator.getTokenCost(node);

        if (deficitAccumulator >= targetTokensToRemove) break;
      }

      if (nodesToSummarize.length < 2) return targets; // Not enough context

      try {
        const snapshotText = await generator.synthesizeSnapshot(
          nodesToSummarize,
          options.systemInstruction,
        );
        const newId = randomUUID();
        const snapshotNode: Snapshot = {
          id: newId,
          logicalParentId: newId,
          type: 'SNAPSHOT',
          timestamp: Date.now(),
          text: snapshotText,
          abstractsIds: nodesToSummarize.map((n) => n.id),
        };

        const consumedIds = nodesToSummarize.map((n) => n.id);
        const returnedNodes = targets.filter(
          (t) => !consumedIds.includes(t.id),
        );
        const firstRemovedIdx = targets.findIndex((t) =>
          consumedIds.includes(t.id),
        );

        if (firstRemovedIdx !== -1) {
          const idx = Math.max(0, firstRemovedIdx);
          returnedNodes.splice(idx, 0, snapshotNode);
        } else {
          returnedNodes.unshift(snapshotNode);
        }

        return returnedNodes;
      } catch (e) {
        debugLogger.error('StateSnapshotProcessor failed sync backstop', e);
        return targets;
      }
    },
  };
}
