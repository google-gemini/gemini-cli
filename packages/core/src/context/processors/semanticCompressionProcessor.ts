/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Episode } from '../ir/types.js';
import type { ContextAccountingState, ContextProcessor } from '../pipeline.js';
import type { Config } from '../../config/config.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { LlmRole } from '../../telemetry/types.js';
import { getResponseText } from '../../utils/partUtils.js';
import { estimateTokenCountSync } from '../../utils/tokenCalculation.js';

export class SemanticCompressionProcessor implements ContextProcessor {
  readonly name = 'SemanticCompression';
  private config: Config;
  private modelToUse: string = 'chat-compression-2.5-flash-lite';

  constructor(config: Config) {
    this.config = config;
  }

  async process(
    episodes: Episode[],
    state: ContextAccountingState,
  ): Promise<Episode[]> {
    // If the budget is satisfied, or semantic compression isn't enabled
    if (state.isBudgetSatisfied) {
      return episodes;
    }

    const semanticConfig =
      this.config.getContextManagementConfig().strategies.semanticCompression;
    // We estimate 4 chars per token for truncation logic
    const thresholdChars = semanticConfig.nodeThresholdTokens * 4;
    this.modelToUse = semanticConfig.compressionModel;

    let currentDeficit = state.deficitTokens;
    const newEpisodes = [...episodes];

    // We scan backwards (oldest to newest would also work, but older is safer to degrade first)
    for (let i = 0; i < newEpisodes.length; i++) {
      if (currentDeficit <= 0) break;
      const ep = newEpisodes[i];
      if (state.protectedEpisodeIds.has(ep.id)) continue;

      // 1. Compress User Prompts
      if (ep.trigger.type === 'USER_PROMPT') {
        for (const part of ep.trigger.semanticParts) {
          if (currentDeficit <= 0) break;
          if (part.type !== 'text') continue;
          // If it's already got a presentation, we don't want to re-summarize a summary
          if (part.presentation) continue;

          if (part.text.length > thresholdChars) {
            const summary = await this.generateSummary(
              part.text,
              'User Prompt',
            );
            const newTokens = estimateTokenCountSync([{ text: summary }]);
            const oldTokens = estimateTokenCountSync([{ text: part.text }]);

            if (newTokens < oldTokens) {
              part.presentation = { text: summary, tokens: newTokens };
              ep.trigger.metadata.transformations.push({
                processorName: this.name,
                action: 'SUMMARIZED',
                timestamp: Date.now(),
              });
              currentDeficit -= oldTokens - newTokens;
            }
          }
        }
      }

      // 2. Compress Model Thoughts
      for (const step of ep.steps) {
        if (currentDeficit <= 0) break;
        if (step.type === 'AGENT_THOUGHT') {
          if (step.presentation) continue;
          if (step.text.length > thresholdChars) {
            const summary = await this.generateSummary(
              step.text,
              'Agent Thought',
            );
            const newTokens = estimateTokenCountSync([{ text: summary }]);
            const oldTokens = estimateTokenCountSync([{ text: step.text }]);

            if (newTokens < oldTokens) {
              step.presentation = { text: summary, tokens: newTokens };
              step.metadata.transformations.push({
                processorName: this.name,
                action: 'SUMMARIZED',
                timestamp: Date.now(),
              });
              currentDeficit -= oldTokens - newTokens;
            }
          }
        }

        // 3. Compress Tool Observations
        if (step.type === 'TOOL_EXECUTION') {
          const rawObs = step.presentation?.observation ?? step.observation;

          let stringifiedObs = '';
          if (typeof rawObs === 'string') {
            stringifiedObs = rawObs;
          } else {
            try {
              stringifiedObs = JSON.stringify(rawObs);
            } catch (_e) {
              stringifiedObs = String(rawObs);
            }
          }

          if (
            stringifiedObs.length > thresholdChars &&
            !stringifiedObs.includes('<tool_output_masked>')
          ) {
            const summary = await this.generateSummary(
              stringifiedObs,
              `Tool Output (${step.toolName})`,
            );

            // Wrap the summary in an object so the Gemini API accepts it as a valid functionResponse.response
            const newObsObject = { summary };

            const newObsTokens = estimateTokenCountSync([
              {
                functionResponse: {
                  name: step.toolName,
                  response: newObsObject as unknown as Record<string, unknown>, // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
                  id: step.id,
                },
              },
            ]);

            const oldObsTokens =
              step.presentation?.tokens.observation ?? step.tokens.observation;
            const intentTokens =
              step.presentation?.tokens.intent ?? step.tokens.intent;

            if (newObsTokens < oldObsTokens) {
              step.presentation = {
                intent: step.presentation?.intent ?? step.intent,
                observation: newObsObject,
                tokens: { intent: intentTokens, observation: newObsTokens },
              };
              step.metadata.transformations.push({
                processorName: this.name,
                action: 'SUMMARIZED',
                timestamp: Date.now(),
              });
              currentDeficit -= oldObsTokens - newObsTokens;
            }
          }
        }
      }
    }

    return newEpisodes;
  }

  private async generateSummary(
    content: string,
    contentType: string,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const promptMessage = `You are compressing an old episodic context buffer for an AI assistant.\nSummarize this ${contentType} block in 2-3 highly technical sentences. Keep all critical facts, file names, dependencies, and architectural decisions. Discard conversational filler and boilerplate.\n\nContent:\n${content.slice(0, 30000)}`;

    const client = this.config.getBaseLlmClient();
    try {
      const response = await client.generateContent({
        modelConfigKey: { model: this.modelToUse },
        contents: [{ role: 'user', parts: [{ text: promptMessage }] }],
        promptId: 'local-context-compression-summary',
        role: LlmRole.UTILITY_COMPRESSOR,
        abortSignal: abortSignal ?? new AbortController().signal,
      });
      const text = getResponseText(response) ?? '';
      return `[Semantic Summary of old ${contentType}]\n${text.trim()}`;
    } catch (_e) {
      debugLogger.warn('Semantic compression LLM call failed: ' + String(_e));
      // If we fail to summarize, we just return the original truncated by 50% as a fail-safe, or the original.
      // Returning original is safer to prevent data loss on API failure.
      return content;
    }
  }
}
