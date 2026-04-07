/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextAccountingState, ContextProcessor } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { truncateProportionally } from '../truncation.js';
import type { EpisodeEditor } from '../ir/episodeEditor.js';

export interface HistorySquashingProcessorOptions {
  maxTokensPerNode: number;
}

export class HistorySquashingProcessor implements ContextProcessor {
  static create(env: ContextEnvironment, options: HistorySquashingProcessorOptions): HistorySquashingProcessor {
    return new HistorySquashingProcessor(env, options);
  }

  static readonly schema = {
    type: 'object',
    properties: {
      maxTokensPerNode: {
        type: 'number',
        description: 'The maximum tokens a node can have before being truncated.',
      },
    },
    required: ['maxTokensPerNode'],
  };

  readonly id = 'HistorySquashingProcessor';
  readonly name = 'HistorySquashingProcessor';
  readonly options: HistorySquashingProcessorOptions;

  constructor(env: ContextEnvironment, options: HistorySquashingProcessorOptions) {
    this.options = options;
  }

  private tryApplySquash(
    text: string,
    limitChars: number,
    currentDeficit: number,
    setPresentation: (p: { text: string; tokens: number }) => void,
    recordAudit: () => void,
  ): number {
    if (currentDeficit <= 0) return 0;
    const originalLength = text.length;
    if (originalLength <= limitChars) return 0;

    const newText = truncateProportionally(
      text,
      limitChars,
      `\n\n[... OMITTED ${originalLength - limitChars} chars ...]\n\n`,
    );

    if (newText !== text) {
      const newTokens = Math.floor(newText.length / 4);
      const oldTokens = Math.floor(originalLength / 4);
      const tokensSaved = oldTokens - newTokens;

      setPresentation({ text: newText, tokens: newTokens });
      recordAudit();
      return tokensSaved;
    }
    return 0;
  }

  async process(
    editor: EpisodeEditor,
    state: ContextAccountingState,
  ): Promise<void> {
    if (state.isBudgetSatisfied) {
      return;
    }

    const { maxTokensPerNode } = this.options;
    // We estimate 4 chars per token for truncation logic
    const limitChars = maxTokensPerNode * 4;

    // We track how many tokens we still need to cut. If we hit 0, we can stop early!
    let currentDeficit = state.deficitTokens;

    for (const ep of editor.episodes) {
      if (currentDeficit <= 0) break;
      if (state.protectedEpisodeIds.has(ep.id)) continue;

      // 1. Squash User Prompts
      if (ep.trigger.type === 'USER_PROMPT') {
        for (let j = 0; j < ep.trigger.semanticParts.length; j++) {
          const part = ep.trigger.semanticParts[j];
          if (part.type === 'text') {
            const saved = this.tryApplySquash(
              part.text,
              limitChars,
              currentDeficit,
              (p) => {
                 editor.editEpisode(ep.id, 'SQUASH_PROMPT', (draft) => {
                    if (draft.trigger.type === 'USER_PROMPT') {
                       draft.trigger.semanticParts[j].presentation = p;
                    }
                 });
              },
              () => {
                 editor.editEpisode(ep.id, 'SQUASH_PROMPT', (draft) => {
                    draft.trigger.metadata.transformations.push({
                      processorName: this.name,
                      action: 'TRUNCATED',
                      timestamp: Date.now(),
                    });
                 });
              }
            );
            currentDeficit -= saved;
          }
        }
      }

      // 2. Squash Model Thoughts
      if (ep.steps) {
        for (let j = 0; j < ep.steps.length; j++) {
          const step = ep.steps[j];
          if (currentDeficit <= 0) break;
          if (step.type === 'AGENT_THOUGHT') {
            const saved = this.tryApplySquash(
              step.text,
              limitChars,
              currentDeficit,
              (p) => {
                 editor.editEpisode(ep.id, 'SQUASH_THOUGHT', (draft) => {
                    const draftStep = draft.steps[j];
                    if (draftStep.type === 'AGENT_THOUGHT') {
                       draftStep.presentation = p;
                    }
                 });
              },
              () => {
                 editor.editEpisode(ep.id, 'SQUASH_THOUGHT', (draft) => {
                    const draftStep = draft.steps[j];
                    if (draftStep.type === 'AGENT_THOUGHT') {
                        draftStep.metadata.transformations.push({
                          processorName: this.name,
                          action: 'TRUNCATED',
                          timestamp: Date.now(),
                        });
                    }
                 });
              }
            );
            currentDeficit -= saved;
          }
        }
      }

      // 3. Squash Agent Yields
      if (currentDeficit > 0 && ep.yield) {
        const saved = this.tryApplySquash(
          ep.yield.text,
          limitChars,
          currentDeficit,
          (p) => {
              editor.editEpisode(ep.id, 'SQUASH_YIELD', (draft) => {
                 if (draft.yield) draft.yield.presentation = p;
              });
          },
          () => {
              editor.editEpisode(ep.id, 'SQUASH_YIELD', (draft) => {
                 if (draft.yield) {
                     draft.yield.metadata.transformations.push({
                      processorName: this.name,
                      action: 'TRUNCATED',
                      timestamp: Date.now(),
                    });
                 }
              });
          }
        );
        currentDeficit -= saved;
      }
    }
  }
}
