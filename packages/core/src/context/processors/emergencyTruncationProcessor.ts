/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ContextProcessor,
  ContextAccountingState,
  BackstopTargetOptions,
} from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import type { EpisodeEditor } from '../ir/episodeEditor.js';

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

  async process(
    editor: EpisodeEditor,
    state: ContextAccountingState,
  ): Promise<void> {
    const toRemove: string[] = [];

    // Calculate how many tokens we need to remove based on the configured knob
    let targetTokensToRemove = 0;
    const strategy = this.options.target ?? 'max';
    
    if (strategy === 'incremental') {
       if (state.currentTokens <= state.maxTokens) return;
       targetTokensToRemove = state.currentTokens - state.maxTokens;
    } else if (strategy === 'freeNTokens') {
       targetTokensToRemove = this.options.freeTokensTarget ?? 0;
       if (targetTokensToRemove <= 0) return;
    } else if (strategy === 'max') {
       // 'max' means we remove all targets without stopping early
       targetTokensToRemove = Infinity;
    }

    let removedTokens = 0;

    // Iterate specifically over targets (which represent the aged-out delta).
    // The editor returns targets from oldest to newest based on the working order.
    // For truncation, we want to cut the oldest first.
    for (const target of editor.targets) {
      const ep = target.episode;
      // We only truncate entire episodes here for safety and structural integrity
      if (target.node !== ep) continue;
      
      if (removedTokens >= targetTokensToRemove) break;

      const epTokens = this._env.tokenCalculator.calculateEpisodeListTokens([
        ep,
      ]);

      if (!state.protectedEpisodeIds.has(ep.id) && !toRemove.includes(ep.id)) {
        removedTokens += epTokens;
        toRemove.push(ep.id);
      }
    }

    if (toRemove.length > 0) {
      editor.removeEpisodes(toRemove, 'TRUNCATED');
    }
  }
}
