/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import type { Config } from '../../config/config.js';
import type { Episode, SnapshotVariant } from '../ir/types.js';
import type { AsyncContextWorker } from './asyncContextWorker.js';
import type {
  ContextEventBus,
  ContextConsolidationEvent,
} from '../eventBus.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { estimateTokenCountSync } from '../../utils/tokenCalculation.js';
import { IrMapper } from '../ir/mapper.js';
import { LlmRole } from '../../telemetry/llmRole.js';

export class StateSnapshotWorker implements AsyncContextWorker {
  name = 'StateSnapshotWorker';
  private bus?: ContextEventBus;
  private isSynthesizing = false;

  constructor(private readonly _config: Config) {}

  start(bus: ContextEventBus): void {
    this.bus = bus;
    this.bus.onConsolidationNeeded(this.handleConsolidation.bind(this));
  }

  stop(): void {
    if (this.bus) {
      // In a real implementation we would `removeListener` here
      this.bus = undefined;
    }
  }

  private async handleConsolidation(
    event: ContextConsolidationEvent,
  ): Promise<void> {
    if (this.isSynthesizing || event.targetDeficit <= 0) return;

    // Identify the "dying" block of episodes that need to be collected.
    // For now, we assume older episodes are at the front of the array.
    // We only want episodes that don't already have a snapshot variant computing/ready.
    const unprotectedOldest = event.episodes.filter(
      (ep) => !ep.variants?.['snapshot'],
    );

    if (unprotectedOldest.length === 0) return;

    let targetDeficit = event.targetDeficit;
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

    if (episodesToSynthesize.length === 0) return;

    this.isSynthesizing = true;

    try {
      debugLogger.log(
        `StateSnapshotWorker: Asynchronously synthesizing ${episodesToSynthesize.length} episodes to recover ~${tokensToSynthesize} tokens.`,
      );

      const client = this._config.getBaseLlmClient();
      const rawContents = IrMapper.fromIr(episodesToSynthesize);

      const promptText = `
You are a background memory consolidation worker for an AI assistant.
Your task is to review the following block of the oldest conversation history and synthesize it into a highly dense, accurate "World State Snapshot".
This snapshot will completely replace these old memories. 
Preserve all critical facts, technical decisions, file paths, and outstanding tasks. Discard all conversational filler.

Conversation History to Synthesize:
${JSON.stringify(rawContents, null, 2).slice(0, 50000)}

Output the snapshot as a dense, structured summary.`;

      const response = await client.generateContent({
        modelConfigKey: { model: 'gemini-2.5-flash' }, // Fast and cheap for background tasks
        contents: [{ role: 'user', parts: [{ text: promptText }] }],
        promptId: 'async-world-state-snapshot',
        role: LlmRole.UTILITY_COMPRESSOR,
        abortSignal: new AbortController().signal, // Run in background, could add cancellation logic later
      });

      // Extract text safely from the GenAI response
      const snapshotText = response.text || '[Failed to generate snapshot]';
      const mockSnapshotText = `
<world_state_snapshot>
${snapshotText}
</world_state_snapshot>`;

      const snapshotTokens = estimateTokenCountSync([
        { text: mockSnapshotText },
      ]);

      const replacedEpisodeIds = episodesToSynthesize.map((e) => e.id);

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
            transformations: [
              {
                processorName: 'StateSnapshotWorker',
                action: 'SYNTHESIZED',
                timestamp: Date.now(),
              },
            ],
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

      const variant: SnapshotVariant = {
        type: 'snapshot',
        status: 'ready',
        recoveredTokens: tokensToSynthesize,
        episode: snapshotEpisode,
        replacedEpisodeIds,
      };

      // Emit the variant for the MOST RECENT episode in the batch,
      // since the Opportunistic Swapper sweeps from newest to oldest.
      const targetId = replacedEpisodeIds[replacedEpisodeIds.length - 1];

      if (this.bus) {
        this.bus.emitVariantReady({
          targetId,
          variantId: 'snapshot',
          variant,
        });
      }
    } finally {
      this.isSynthesizing = false;
    }
  }
}
