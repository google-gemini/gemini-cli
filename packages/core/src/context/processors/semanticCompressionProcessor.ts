/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IrMetadata } from '../ir/types.js';
import type { ContextAccountingState, ContextProcessor } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { LlmRole } from '../../telemetry/types.js';
import { getResponseText } from '../../utils/partUtils.js';


import type { EpisodeEditor } from '../ir/episodeEditor.js';

export class SemanticCompressionProcessor implements ContextProcessor {
  readonly name = 'SemanticCompression';
  private env: ContextEnvironment;
  private options: { nodeThresholdTokens: number };
  private modelToUse: string = 'chat-compression-2.5-flash-lite';

  constructor(
    env: ContextEnvironment,
    options: { nodeThresholdTokens: number },
  ) {
    this.env = env;
    this.options = options;
  }

  async process(
    editor: EpisodeEditor,
    state: ContextAccountingState,
  ): Promise<void> {
    // If the budget is satisfied, or semantic compression isn't enabled
    if (state.isBudgetSatisfied) {
      return;
    }

    const semanticConfig = this.options;
    const limitTokens = semanticConfig.nodeThresholdTokens;
    const thresholdChars = this.env.tokenCalculator.tokensToChars(limitTokens);
    this.modelToUse = 'gemini-2.5-flash';

    let currentDeficit = state.deficitTokens;

    // We scan backwards (oldest to newest would also work, but older is safer to degrade first)
    for (const ep of editor.episodes) {
      if (currentDeficit <= 0) break;
      if (state.protectedEpisodeIds.has(ep.id)) continue;

      // 1. Compress User Prompts
      if (ep.trigger.type === 'USER_PROMPT') {
        for (let j = 0; j < ep.trigger.semanticParts.length; j++) {
          const part = ep.trigger.semanticParts[j];
          if (currentDeficit <= 0) break;
          if (part.type !== 'text') continue;
          // If it's already got a presentation, we don't want to re-summarize a summary
          if (part.presentation) continue;

          if (part.text.length > thresholdChars) {
            const summary = await this.generateSummary(
              part.text,
              'User Prompt',
            );
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: summary }]);
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: part.text }]);

            if (newTokens < oldTokens) {
              editor.editEpisode(ep.id, 'SUMMARIZE_PROMPT', (draft) => {
                 if (draft.trigger.type === 'USER_PROMPT') {
                    draft.trigger.semanticParts[j].presentation = { text: summary, tokens: newTokens };
                    draft.trigger.metadata.transformations.push({
                      processorName: this.name,
                      action: 'SUMMARIZED',
                      timestamp: Date.now(),
                    });
                 }
              });
              currentDeficit -= oldTokens - newTokens;
            }
          }
        }
      }

      // 2. Compress Model Thoughts
      if (ep.steps) {
        for (let j = 0; j < ep.steps.length; j++) {
          const step = ep.steps[j];
          if (currentDeficit <= 0) break;
          if (step.type === 'AGENT_THOUGHT') {
            if (step.presentation) continue;
            if (step.text.length > thresholdChars) {
              const summary = await this.generateSummary(
                step.text,
                'Agent Thought',
              );
              const newTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: summary }]);
              const oldTokens = this.env.tokenCalculator.estimateTokensForParts([{ text: step.text }]);

              if (newTokens < oldTokens) {
                editor.editEpisode(ep.id, 'SUMMARIZE_THOUGHT', (draft) => {
                   const draftStep = draft.steps![j];
                   if (draftStep.type === 'AGENT_THOUGHT') {
                      draftStep.presentation = { text: summary, tokens: newTokens };
                      draftStep.metadata.transformations.push({
                        processorName: this.name,
                        action: 'SUMMARIZED',
                        timestamp: Date.now(),
                      });
                   }
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

              const newObsTokens = this.env.tokenCalculator.estimateTokensForParts([
                {
                  functionResponse: {
                    name: step.toolName,
                    response: newObsObject as unknown as Record<string, unknown>, // eslint-disable-line @typescript-eslint/no-unsafe-type-assertion
                    id: step.id,
                  },
                },
              ]);

              const oldObsTokens =
                step.presentation?.tokens?.observation ?? step.tokens?.observation ?? step.tokens;
              const intentTokens =
                step.presentation?.tokens?.intent ?? step.tokens?.intent ?? 0;

              if (newObsTokens < oldObsTokens) {
                editor.editEpisode(ep.id, 'SUMMARIZE_TOOL', (draft) => {
                   const draftStep = draft.steps![j];
                   if (draftStep.type === 'TOOL_EXECUTION') {
                      draftStep.presentation = {
                        intent: draftStep.presentation?.intent ?? draftStep.intent,
                        observation: newObsObject,
                        tokens: { intent: intentTokens as number, observation: newObsTokens },
                      };
                      if (!draftStep.metadata) { draftStep.metadata = { transformations: [], currentTokens: 0, originalTokens: 0 } as unknown as IrMetadata };
                      if (!draftStep.metadata.transformations) { draftStep.metadata.transformations = [] };
                      draftStep.metadata.transformations.push({
                        processorName: this.name,
                        action: 'SUMMARIZED',
                        timestamp: Date.now(),
                      });
                   }
                });
                currentDeficit -= oldObsTokens - newObsTokens;
              }
            }
          }
        }
      }
    }
  }

  private async generateSummary(
    content: string,
    contentType: string,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    const promptMessage = `You are compressing an old episodic context buffer for an AI assistant.\nSummarize this ${contentType} block in 2-3 highly technical sentences. Keep all critical facts, file names, dependencies, and architectural decisions. Discard conversational filler and boilerplate.\n\nContent:\n${content.slice(0, 30000)}`;

    const client = this.env.llmClient;
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
