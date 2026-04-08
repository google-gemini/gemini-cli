/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ContextProcessor,
  BackstopTargetOptions,
  ProcessArgs,
  ContextPatch,
} from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';

export type EmergencyTruncationProcessorOptions = BackstopTargetOptions;

export class EmergencyTruncationProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    options: EmergencyTruncationProcessorOptions,
  ): EmergencyTruncationProcessor {
    return new EmergencyTruncationProcessor(env, options);
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

  readonly id = 'EmergencyTruncationProcessor';
  readonly name = 'EmergencyTruncationProcessor';
  readonly options: EmergencyTruncationProcessorOptions;
  constructor(
    private readonly _env: ContextEnvironment,
    options: EmergencyTruncationProcessorOptions,
  ) {
    this.options = options;
  }

  async process({
    ship,
    triggerTargets,
    state,
  }: ProcessArgs): Promise<ContextPatch[]> {
    const toRemove: string[] = [];

    // Calculate how many tokens we need to remove based on the configured knob
    let targetTokensToRemove = 0;
    const strategy = this.options.target ?? 'max';
    
    if (strategy === 'incremental') {
       if (state.currentTokens <= state.maxTokens) return [];
       targetTokensToRemove = state.currentTokens - state.maxTokens;
    } else if (strategy === 'freeNTokens') {
       targetTokensToRemove = this.options.freeTokensTarget ?? 0;
       if (targetTokensToRemove <= 0) return [];
    } else if (strategy === 'max') {
       // 'max' means we remove all targets without stopping early
       targetTokensToRemove = Infinity;
    }

    let removedTokens = 0;

    // The ship is sequentially ordered from oldest to newest.
    // We want to delete the oldest targeted nodes first.
    for (const node of ship) {
      // Is this node part of the targeted delta (e.g. aged out of the budget)?
      if (!triggerTargets.has(node.id)) continue;
      // Is this node explicitly protected (e.g. part of an active Task)?
      if (node.logicalParentId && state.protectedLogicalIds.has(node.logicalParentId)) continue;
      
      if (removedTokens >= targetTokensToRemove) break;

      removedTokens += node.metadata.currentTokens;
      toRemove.push(node.id);
    }

    if (toRemove.length === 0) return [];

    return [{
      removedIds: toRemove,
      metadata: {
        originalTokens: removedTokens,
        currentTokens: 0,
        transformations: [{
          processorName: this.name,
          action: 'TRUNCATED',
          timestamp: Date.now(),
        }],
      }
    }];
  }
}
