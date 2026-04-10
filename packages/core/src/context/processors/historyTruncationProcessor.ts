/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ContextProcessor,
  BackstopTargetOptions,
  ProcessArgs,
} from '../pipeline.js';
import type { ConcreteNode } from '../ir/types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';

export type HistoryTruncationProcessorOptions = BackstopTargetOptions;

export function createHistoryTruncationProcessor(
  id: string,
  env: ContextEnvironment,
  options: HistoryTruncationProcessorOptions,
): ContextProcessor {
  return {
    id,
    name: 'HistoryTruncationProcessor',
    process: async ({ targets }: ProcessArgs) => {
      // Calculate how many tokens we need to remove based on the configured knob
      let targetTokensToRemove = 0;
      const strategy = options.target ?? 'max';

      if (strategy === 'incremental') {
        targetTokensToRemove = Infinity;
      } else if (strategy === 'freeNTokens') {
        targetTokensToRemove = options.freeTokensTarget ?? 0;
        if (targetTokensToRemove <= 0) return targets;
      } else if (strategy === 'max') {
        // 'max' means we remove all targets without stopping early
        targetTokensToRemove = Infinity;
      }

      let removedTokens = 0;
      const keptNodes: ConcreteNode[] = [];

      // The targets are sequentially ordered from oldest to newest.
      // We want to delete the oldest targets first.
      for (const node of targets) {
        if (removedTokens >= targetTokensToRemove) {
          keptNodes.push(node);
          continue;
        }

        removedTokens += env.tokenCalculator.getTokenCost(node);
      }

      return keptNodes;
    },
  };
}
