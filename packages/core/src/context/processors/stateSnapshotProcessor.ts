/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextProcessor, ContextAccountingState } from '../pipeline.js';
import type { Episode, ToolExecution } from '../ir/types.js';
import type { ContextEnvironment, ContextEventBus } from '../sidecar/environment.js';
import { estimateContextTokenCountSync as estimateTokenCountSync } from '../utils/contextTokenCalculator.js';
import { v4 as uuidv4 } from 'uuid';
import { LlmRole } from '../../telemetry/llmRole.js';

export interface StateSnapshotProcessorOptions {
  model?: string;
  systemInstruction?: string;
  triggerDeficitTokens?: number;
}

export class StateSnapshotProcessor implements ContextProcessor {
  static create(env: ContextEnvironment, options: StateSnapshotProcessorOptions): StateSnapshotProcessor {
    return new StateSnapshotProcessor(env, options, (env as any).getEventBus());
  }
  readonly id = 'StateSnapshotProcessor';
  readonly name = 'StateSnapshotProcessor';
  readonly options: StateSnapshotProcessorOptions;
  private readonly env: ContextEnvironment;
  private isSynthesizing = false;

  constructor(
    env: ContextEnvironment,
    options: StateSnapshotProcessorOptions,
    eventBus: ContextEventBus,
  ) {
    this.env = env;
    this.options = options;
  }

  async process(episodes: Episode[], state: ContextAccountingState): Promise<Episode[]> {
    const targetDeficit = Math.max(0, state.currentTokens - state.retainedTokens);
    if (this.isSynthesizing || targetDeficit <= 0) return episodes;

    this.isSynthesizing = true;
    try {
      let deficitAccumulator = 0;
      const selectedEpisodes: Episode[] = [];

      for (let i = 1; i < episodes.length - 1; i++) {
        const ep = episodes[i];
        selectedEpisodes.push(ep);
        deficitAccumulator += estimateTokenCountSync([
          { text: (ep.trigger as any)?.semanticParts?.[0]?.text ?? '' },
          { text: ep.yield?.text ?? '' },
        ]);
        if (deficitAccumulator >= targetDeficit) break;
      }

      if (selectedEpisodes.length < 2) return episodes; // Not enough context to summarize

      // Optimization: Do NOT emit VariantComputing, let the Orchestrator handle caching the final result.
      const snapshotEp: Episode = await this.synthesizeSnapshot(selectedEpisodes);
      
      const newEpisodes = [...episodes];
      
      // Calculate indices to splice
      const firstIndex = newEpisodes.findIndex(e => e.id === selectedEpisodes[0].id);
      
      if (firstIndex !== -1) {
        newEpisodes.splice(firstIndex, selectedEpisodes.length, snapshotEp);
      }
      
      return newEpisodes;
    } finally {
      this.isSynthesizing = false;
    }
  }

  private async synthesizeSnapshot(episodes: Episode[]): Promise<Episode> {
    const client = this.env.getLlmClient();
    const systemPrompt =
      this.options.systemInstruction ??
      `You are an expert Context Memory Manager. You will be provided with a raw transcript of older conversation turns between a user and an AI assistant.
Your task is to synthesize these turns into a single, dense, factual snapshot that preserves all critical context, preferences, active tasks, and factual knowledge, but discards conversational filler, pleasantries, and redundant back-and-forth iterations.

Output ONLY the raw factual snapshot, formatted compactly. Do not include markdown wrappers, prefixes like "Here is the snapshot", or conversational elements.`;

    let userPromptText = 'TRANSCRIPT TO SNAPSHOT:\n\n';
    for (const ep of episodes) {
      if (ep.trigger) {
        userPromptText += `USER: ${(ep.trigger as any).semanticParts?.map((p: any) => p.text).join('')}\n`;
      }
      for (const step of ep.steps) {
        if (step.type === 'TOOL_EXECUTION') {
          userPromptText += `[Tool Called: ${(step as ToolExecution).toolName}]\n`;
        }
      }
      if (ep.yield) {
        userPromptText += `ASSISTANT: ${ep.yield.text}\n`;
      }
      userPromptText += '\n';
    }

    try {
      const response = await client.generateContent(
        {
          modelConfigKey: { model: 'state-snapshot-processor' },
          contents: [{ role: 'user', parts: [{ text: userPromptText }] }],
          systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
          promptId: this.env.getPromptId(),
          role: LlmRole.UTILITY_STATE_SNAPSHOT_PROCESSOR,
          abortSignal: new AbortController().signal,
        },
      );

      const snapshotText = response.text;

      // Synthesize a new "Episode" representing this compressed block
      const newId = uuidv4();
      const contentTokens = estimateTokenCountSync([{ text: snapshotText }]);

      return {
        id: newId,
        timestamp: Date.now(),
        trigger: {
          id: `${newId}-t`,
          type: 'USER_PROMPT',
          semanticParts: [],
          metadata: {
            originalTokens: 0,
            currentTokens: 0,
            transformations: [],
          },
        },
        steps: [],
        yield: {
          id: `${newId}-y`,
          type: 'AGENT_YIELD',
          text: `<CONTEXT_SNAPSHOT>\n${snapshotText}\n</CONTEXT_SNAPSHOT>`,
          metadata: {
            originalTokens: contentTokens,
            currentTokens: contentTokens,
            transformations: [{ processorName: 'StateSnapshotProcessor', action: 'SYNTHESIZED', timestamp: Date.now() }],
          },
        },
      };
    } catch (error) {
      console.error('Failed to synthesize snapshot:', error);
      throw error;
    }
  }
}
