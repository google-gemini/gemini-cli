/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextProcessor, ContextAccountingState } from '../pipeline.js';
import type { Episode } from '../ir/types.js';
import type { ContextEnvironment } from '../sidecar/environment.js';


export interface EmergencyTruncationProcessorOptions {}

export class EmergencyTruncationProcessor implements ContextProcessor {
  static create(env: ContextEnvironment, options: EmergencyTruncationProcessorOptions): EmergencyTruncationProcessor {
    return new EmergencyTruncationProcessor(env, options);
  }

  readonly id = 'EmergencyTruncationProcessor';
  readonly name = 'EmergencyTruncationProcessor';
  readonly options: EmergencyTruncationProcessorOptions;
  constructor(private readonly _env: ContextEnvironment, options: EmergencyTruncationProcessorOptions) {
    this.options = options;
  }

  async process(episodes: Episode[], state: ContextAccountingState): Promise<Episode[]> {
    if (state.currentTokens <= state.maxTokens) return episodes;

    let remainingTokens = state.currentTokens;
    const targetTokens = state.maxTokens;
    const truncated: Episode[] = [];
    
    // We respect the global protected Episode IDs (like the system prompt at index 0)
    for (const ep of episodes) {
      const epTokens = this._env.tokenCalculator.calculateEpisodeListTokens([ep]);
      
      if (remainingTokens > targetTokens && !state.protectedEpisodeIds.has(ep.id)) {
        remainingTokens -= epTokens;
        // Dropped! We do not add it to the truncated array.
      } else {
        truncated.push(ep);
      }
    }
    
    return truncated;
  }
}
