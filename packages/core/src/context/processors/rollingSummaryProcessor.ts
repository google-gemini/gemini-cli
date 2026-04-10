/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {
  ContextProcessor,
  ProcessArgs,
  BackstopTargetOptions,
} from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import type { ConcreteNode, RollingSummary } from '../ir/types.js';
import { SnapshotGenerator } from '../utils/snapshotGenerator.js';
import { debugLogger } from '../../utils/debugLogger.js';

export interface RollingSummaryProcessorOptions extends BackstopTargetOptions {
  systemInstruction?: string;
}

export function createRollingSummaryProcessor(
  id: string,
  env: ContextEnvironment,
  options: RollingSummaryProcessorOptions,
): ContextProcessor {
  const generator = new SnapshotGenerator(env);

  return {
    id,
    name: 'RollingSummaryProcessor',
    process: async ({ targets }: ProcessArgs) => {
      if (targets.length === 0) return targets;

      const strategy = options.target ?? 'max';
      let targetTokensToRemove = 0;

      if (strategy === 'incremental') {
        // A rolling summary should target a small chunk. For now, since state isn't passed,
        // we'll default to a fixed threshold, like 10000 tokens, to avoid eating the whole history.
        // Ideally, the orchestrator should pass `tokensToRemove` explicitly.
        targetTokensToRemove = 10000;
      } else if (strategy === 'freeNTokens') {
        targetTokensToRemove = options.freeTokensTarget ?? Infinity;
      } else if (strategy === 'max') {
        targetTokensToRemove = Infinity;
      }

      if (targetTokensToRemove <= 0) return targets;

      let deficitAccumulator = 0;
      const nodesToSummarize: ConcreteNode[] = [];

      // Scan oldest to newest to find the oldest block that exceeds the token requirement
      for (const node of targets) {
        if (node.id === targets[0].id && node.type === 'USER_PROMPT') {
          // Keep system prompt if it's the very first node
          continue;
        }

        nodesToSummarize.push(node);
        deficitAccumulator += env.tokenCalculator.getTokenCost(node);

        if (deficitAccumulator >= targetTokensToRemove) break;
      }

      if (nodesToSummarize.length < 2) return targets; // Not enough context to summarize

      try {
        // Synthesize the rolling summary synchronously
        const snapshotText = await generator.synthesizeSnapshot(
          nodesToSummarize,
          options.systemInstruction,
        );
        const newId = env.idGenerator.generateId();

        const summaryNode: RollingSummary = {
          id: newId,
          logicalParentId: newId,
          type: 'ROLLING_SUMMARY',
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
          returnedNodes.splice(idx, 0, summaryNode);
        } else {
          returnedNodes.unshift(summaryNode);
        }

        return returnedNodes;
      } catch (e) {
        debugLogger.error('RollingSummaryProcessor failed sync backstop', e);
        return targets;
      }
    },
  };
}
