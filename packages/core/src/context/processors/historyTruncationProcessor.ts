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
import type { ContextEnvironment } from '../sidecar/environment.js';

export type HistoryTruncationProcessorOptions = BackstopTargetOptions;

export class HistoryTruncationProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    options: HistoryTruncationProcessorOptions,
  ): HistoryTruncationProcessor {
    return new HistoryTruncationProcessor(env, options);
  }

  static readonly schema = {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['incremental', 'freeNTokens', 'max'],
        description: 'How much of the targeted history to truncate.',
      },
      freeTokensTarget: {
        type: 'number',
        description: 'The number of tokens to free if target is freeNTokens.',
      },
    },
  };

  readonly componentType = 'processor';
  readonly id = 'HistoryTruncationProcessor';
  readonly name = 'HistoryTruncationProcessor';
  private readonly env: ContextEnvironment;
  readonly options: HistoryTruncationProcessorOptions;
  constructor(
    env: ContextEnvironment,
    options: HistoryTruncationProcessorOptions,
  ) {
    this.env = env;
    this.options = options;
  }

  async process({
    targets,
  }: ProcessArgs): Promise<readonly ConcreteNode[]> {
    // Calculate how many tokens we need to remove based on the configured knob
    let targetTokensToRemove = 0;
    const strategy = this.options.target ?? 'max';
    
    if (strategy === 'incremental') {
       targetTokensToRemove = Infinity;
    } else if (strategy === 'freeNTokens') {
       targetTokensToRemove = this.options.freeTokensTarget ?? 0;
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

      removedTokens += this.env.tokenCalculator.getTokenCost(node);
    }

    return keptNodes;
  }
}
