/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextProcessor, ContextAccountingState } from '../pipeline.js';
import type { Episode } from '../ir/types.js';
import type { ContextEnvironment } from '../sidecar/environment.js';


import type { EpisodeEditor } from '../ir/episodeEditor.js';

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

  async process(editor: EpisodeEditor, state: ContextAccountingState): Promise<void> {
    if (state.currentTokens <= state.maxTokens) return;

    let remainingTokens = state.currentTokens;
    const targetTokens = state.maxTokens;
    const toRemove: string[] = [];
    
    // We respect the global protected Episode IDs (like the system prompt at index 0)
    for (const ep of editor.episodes) {
      const epTokens = this._env.tokenCalculator.calculateEpisodeListTokens([ep]);
      
      if (remainingTokens > targetTokens && !state.protectedEpisodeIds.has(ep.id)) {
        remainingTokens -= epTokens;
        toRemove.push(ep.id);
      }
    }
    
    if (toRemove.length > 0) {
      editor.removeEpisodes(toRemove, 'TRUNCATED');
    }
  }
}
