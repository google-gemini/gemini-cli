/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextAccountingState, ContextProcessor } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { LlmRole } from '../../telemetry/types.js';
import { getResponseText } from '../../utils/partUtils.js';
import type { EpisodeEditor } from '../ir/episodeEditor.js';
import { isAgentThought, isToolExecution, isUserPrompt } from '../ir/graphUtils.js';

export interface SemanticCompressionProcessorOptions {
  nodeThresholdTokens: number;
}

export class SemanticCompressionProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    options: SemanticCompressionProcessorOptions,
  ): SemanticCompressionProcessor {
    return new SemanticCompressionProcessor(env, options);
  }

  static readonly schema = {
    type: 'object',
    properties: {
      nodeThresholdTokens: {
        type: 'number',
        description: 'The token threshold above which nodes are summarized.',
      },
    },
    required: ['nodeThresholdTokens'],
  };

  readonly id = 'SemanticCompressionProcessor';
  readonly name = 'SemanticCompressionProcessor';
  readonly options: SemanticCompressionProcessorOptions;
  private env: ContextEnvironment;
  private modelToUse: string = 'chat-compression-2.5-flash-lite';

  constructor(
    env: ContextEnvironment,
    options: SemanticCompressionProcessorOptions,
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
    for (const target of editor.targets) {
      const ep = target.episode;
      if (currentDeficit <= 0) break;
      if (state.protectedEpisodeIds.has(ep.id)) continue;

      // 1. Compress User Prompts
      if (target.node === ep.trigger && isUserPrompt(ep.trigger)) {
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
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([
              { text: summary },
            ]);
            const oldTokens = this.env.tokenCalculator.estimateTokensForParts([
              { text: part.text },
            ]);

            if (newTokens < oldTokens) {
              editor.editEpisode(ep.id, 'SUMMARIZE_PROMPT', (draft) => {
                if (isUserPrompt(draft.trigger)) {
                  draft.trigger.semanticParts[j].presentation = {
                    text: summary,
                    tokens: newTokens,
                  };
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
      if (isAgentThought(target.node)) {
        const step = target.node;
        const j = ep.steps.findIndex(s => s.id === step.id);
        if (j !== -1 && currentDeficit > 0 && !step.presentation) {
            if (step.text.length > thresholdChars) {
              const summary = await this.generateSummary(
                step.text,
                'Agent Thought',
              );
              const newTokens = this.env.tokenCalculator.estimateTokensForParts(
                [{ text: summary }],
              );
              const oldTokens = this.env.tokenCalculator.estimateTokensForParts(
                [{ text: step.text }],
              );

              if (newTokens < oldTokens) {
                editor.editEpisode(ep.id, 'SUMMARIZE_THOUGHT', (draft) => {
                  const draftStep = draft.steps[j];
                  if (isAgentThought(draftStep)) {
                    draftStep.presentation = {
                      text: summary,
                      tokens: newTokens,
                    };
                    if (!draftStep.metadata) {
                      draftStep.metadata = {
                        transformations: [],
                        currentTokens: 0,
                        originalTokens: 0,
                      };
                    }
                    if (!draftStep.metadata.transformations) {
                      draftStep.metadata.transformations = [];
                    }
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
      }

      // 3. Compress Tool Observations
      if (isToolExecution(target.node)) {
        const step = target.node;
        const j = ep.steps.findIndex(s => s.id === step.id);
        if (j !== -1 && currentDeficit > 0 && !step.presentation) {
            const rawObs = (step.presentation as any)?.observation ?? step.observation;

            let stringifiedObs = '';
            if (typeof rawObs === 'string') {
              stringifiedObs = rawObs;
            } else {
              try {
                stringifiedObs = JSON.stringify(rawObs);
              } catch {
                stringifiedObs = String(rawObs);
              }
            }

            if (stringifiedObs.length > thresholdChars) {
              const summary = await this.generateSummary(
                stringifiedObs,
                step.toolName,
              );
              const newObsObject = { summary };

              const newObsTokens = this.env.tokenCalculator.estimateTokensForParts([
                {
                  functionResponse: {
                    name: step.toolName,
                    response: newObsObject,
                    id: step.id,
                  },
                },
              ]);

              const oldObsTokens =
                (step.presentation as any)?.tokens?.observation ??
                step.tokens?.observation ?? step.tokens;
              const intentTokens =
                (step.presentation as any)?.tokens?.intent ?? step.tokens?.intent ?? 0;

              if (newObsTokens < oldObsTokens) {
                editor.editEpisode(ep.id, 'SUMMARIZE_TOOL', (draft) => {
                  const draftStep = draft.steps[j];
                  if (isToolExecution(draftStep)) {
                    draftStep.presentation = {
                      intent:
                        draftStep.presentation?.intent ?? draftStep.intent,
                      observation: newObsObject,
                      tokens: {
                        intent: intentTokens,
                        observation: newObsTokens,
                      },
                    };
                    if (!draftStep.metadata) {
                      draftStep.metadata = {
                        transformations: [],
                        currentTokens: 0,
                        originalTokens: 0,
                      };
                    }
                    if (!draftStep.metadata.transformations) {
                      draftStep.metadata.transformations = [];
                    }
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
    } catch (e) {
      debugLogger.warn(`Semantic compression LLM call failed: ${e}`);
      // If we fail to summarize, we just return the original truncated by 50% as a fail-safe, or the original.
      // Returning original is safer to prevent data loss on API failure.
      return content;
    }
  }
}
