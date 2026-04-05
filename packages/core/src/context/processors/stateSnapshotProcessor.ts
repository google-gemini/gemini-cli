/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type { Config } from '../../config/config.js';
import type { Episode } from '../ir/types.js';
import type { ContextProcessor, ContextAccountingState } from '../pipeline.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { estimateTokenCountSync } from '../../utils/tokenCalculation.js';

export class StateSnapshotProcessor implements ContextProcessor {
  name = 'StateSnapshotProcessor';

  constructor(_config: Config) {}

  async process(
    episodes: Episode[],
    state: ContextAccountingState,
  ): Promise<Episode[]> {
    if (state.isBudgetSatisfied) return episodes;

    // TODO: Need a way to read from config if we are doing N-to-1 synthesis.
    // For now, let's establish the structural skeleton.
    

    // Identify the "dying" block of episodes that need to be collected.
    // We grab unprotected episodes from oldest to newest.
    const unprotectedOldest = episodes.filter(
      (ep) => !state.protectedEpisodeIds.has(ep.id),
    );

    if (unprotectedOldest.length === 0) return episodes;

    let targetDeficit = state.deficitTokens;
    const episodesToSynthesize: Episode[] = [];
    let tokensToSynthesize = 0;

    for (const ep of unprotectedOldest) {
      if (tokensToSynthesize >= targetDeficit) break;
      episodesToSynthesize.push(ep);
      // Rough estimate of tokens in this episode
      const epTokens = ep.steps.reduce(
        (sum, step) => sum + step.metadata.currentTokens,
        ep.trigger.metadata.currentTokens +
          (ep.yield?.metadata.currentTokens || 0),
      );
      tokensToSynthesize += epTokens;
    }

    if (episodesToSynthesize.length === 0) return episodes;

    debugLogger.log(
      `StateSnapshotProcessor: Synthesizing ${episodesToSynthesize.length} episodes to recover ~${tokensToSynthesize} tokens.`,
    );

    // TODO: Perform the LLM call using this.config.getBaseLlmClient()
    // For now, we will create a dummy structural snapshot to prove the topological transformation works.

    const mockSnapshotText = `
<world_state_snapshot>
Synthesized ${episodesToSynthesize.length} episodes.
This is where the LLM's highly structured state representation will live.
</world_state_snapshot>`;

    const snapshotTokens = estimateTokenCountSync([{ text: mockSnapshotText }]);

    const snapshotEpisode: Episode = {
      id: randomUUID(),
      timestamp: Date.now(),
      trigger: {
        id: randomUUID(),
        type: 'SYSTEM_EVENT',
        name: 'world_state_snapshot',
        payload: {
          originalEpisodeCount: episodesToSynthesize.length,
          recoveredTokens: tokensToSynthesize,
        },
        metadata: {
          originalTokens: snapshotTokens,
          currentTokens: snapshotTokens,
          transformations: [{processorName: 'StateSnapshotProcessor', action: 'SYNTHESIZED', timestamp: Date.now()}],
        },
      },
      steps: [
        {
          id: randomUUID(),
          type: 'AGENT_THOUGHT',
          text: mockSnapshotText,
          metadata: {
            originalTokens: snapshotTokens,
            currentTokens: snapshotTokens,
            transformations: [],
          },
        },
      ],
    };

    // Filter out the episodes we synthesized from the main graph.
    const synthesizedIds = new Set(episodesToSynthesize.map((e) => e.id));
    const newEpisodes = episodes.filter((ep) => !synthesizedIds.has(ep.id));

    // Inject the new snapshot right after the protected System Prompt
    // (or at the top if no system prompt is protected).
    let insertionIndex = 0;
    if (
      newEpisodes.length > 0 &&
      state.protectedEpisodeIds.has(newEpisodes[0].id)
    ) {
      insertionIndex = 1;
    }

    newEpisodes.splice(insertionIndex, 0, snapshotEpisode);

    // Update state
    // Accounting state is immutable in the pipeline design, it gets recalculated by ContextManager // (Trigger + Thought roughly)

    return newEpisodes;
  }
}
