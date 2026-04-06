/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Episode } from '../ir/types.js';
import type { ContextAccountingState, ContextProcessor } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { truncateProportionally } from '../truncation.js';

export class HistorySquashingProcessor implements ContextProcessor {
  readonly name = 'HistorySquashing';
    private options: { maxTokensPerNode: number };

  constructor(env: ContextEnvironment, options: { maxTokensPerNode: number }) {
    
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
    episodes: Episode[],
    state: ContextAccountingState,
  ): Promise<Episode[]> {
    if (state.isBudgetSatisfied) {
      return episodes;
    }

    const { maxTokensPerNode } = this.options;
    // We estimate 4 chars per token for truncation logic
    const limitChars = maxTokensPerNode * 4;

    // We track how many tokens we still need to cut. If we hit 0, we can stop early!
    let currentDeficit = state.deficitTokens;
    const newEpisodes = [...episodes];

    for (let i = 0; i < newEpisodes.length; i++) {
      if (currentDeficit <= 0) break;
      if (state.protectedEpisodeIds.has(newEpisodes[i].id)) continue;

      const ep = newEpisodes[i];

      // 1. Squash User Prompts
      if (ep.trigger.type === 'USER_PROMPT') {
        for (const part of ep.trigger.semanticParts) {
          if (part.type === 'text') {
            const saved = this.tryApplySquash(
              part.text,
              limitChars,
              currentDeficit,
              (p) => (part.presentation = p),
              () =>
                ep.trigger.metadata.transformations.push({
                  processorName: this.name,
                  action: 'TRUNCATED',
                  timestamp: Date.now(),
                }),
            );
            currentDeficit -= saved;
          }
        }
      }

      // 2. Squash Model Thoughts
      for (const step of ep.steps) {
        if (currentDeficit <= 0) break;
        if (step.type === 'AGENT_THOUGHT') {
          const saved = this.tryApplySquash(
            step.text,
            limitChars,
            currentDeficit,
            (p) => (step.presentation = p),
            () =>
              step.metadata.transformations.push({
                processorName: this.name,
                action: 'TRUNCATED',
                timestamp: Date.now(),
              }),
          );
          currentDeficit -= saved;
        }
      }

      // 3. Squash Agent Yields
      if (currentDeficit > 0 && ep.yield) {
        const saved = this.tryApplySquash(
          ep.yield.text,
          limitChars,
          currentDeficit,
          (p) => (ep.yield!.presentation = p),
          () =>
            ep.yield!.metadata.transformations.push({
              processorName: this.name,
              action: 'TRUNCATED',
              timestamp: Date.now(),
            }),
        );
        currentDeficit -= saved;
      }
    }

    return newEpisodes;
  }
}
