/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { truncateProportionally } from '../truncation.js';
import type { ConcreteNode } from '../ir/types.js';

export interface HistorySquashingProcessorOptions {
  maxTokensPerNode: number;
}

export class HistorySquashingProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    options: HistorySquashingProcessorOptions,
  ): HistorySquashingProcessor {
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
  private env: ContextEnvironment;

  constructor(
    env: ContextEnvironment,
    options: HistorySquashingProcessorOptions,
  ) {
    this.env = env;
    this.options = options;
  }

  private tryApplySquash(
    text: string,
    limitChars: number,
    currentDeficit: number,
  ): { text: string; newTokens: number; oldTokens: number; tokensSaved: number } | null {
    if (currentDeficit <= 0) return null;
    const originalLength = text.length;
    if (originalLength <= limitChars) return null;

    const newText = truncateProportionally(
      text,
      limitChars,
      `\n\n[... OMITTED ${originalLength - limitChars} chars ...]\n\n`,
    );

    if (newText !== text) {
      // Using accurate TokenCalculator instead of simple math
      const newTokens = this.env.tokenCalculator.estimateTokensForString(newText);
      const oldTokens = this.env.tokenCalculator.estimateTokensForString(text);
      const tokensSaved = oldTokens - newTokens;

      if (tokensSaved > 0) {
        return { text: newText, newTokens, oldTokens, tokensSaved };
      }
    }
    return null;
  }

  async process({ targets, state }: ProcessArgs): Promise<readonly ConcreteNode[]> {
    if (state.isBudgetSatisfied) {
      return targets;
    }

    const { maxTokensPerNode } = this.options;
    const limitChars = this.env.tokenCalculator.tokensToChars(maxTokensPerNode);

    let currentDeficit = state.deficitTokens;
    const returnedNodes: ConcreteNode[] = [];

    for (const node of targets) {
      if (currentDeficit <= 0) {
        returnedNodes.push(node);
        continue;
      }

      // 1. Squash User Prompts
      if (node.type === 'USER_PROMPT') {
        const prompt = node;
        let modified = false;
        const newParts = [...prompt.semanticParts];

        for (let j = 0; j < prompt.semanticParts.length; j++) {
          const part = prompt.semanticParts[j];
          if (currentDeficit <= 0) break;
          if (part.type === 'text') {
            const squashResult = this.tryApplySquash(part.text, limitChars, currentDeficit);
            if (squashResult) {
              newParts[j] = { type: 'text', text: squashResult.text };
              currentDeficit -= squashResult.tokensSaved;
              modified = true;
            }
          }
        }

        if (modified) {
          const newTokens = this.env.tokenCalculator.estimateTokensForParts(
             newParts.map(p => {
               if (p.type === 'text') return { text: p.text };
               if (p.type === 'inline_data') return { inlineData: { mimeType: p.mimeType, data: p.data } };
               if (p.type === 'file_data') return { fileData: { mimeType: p.mimeType, fileUri: p.fileUri } };
               return (p as Extract<import('../ir/types.js').SemanticPart, { type: 'raw_part' }>).part;
             })
          );
          returnedNodes.push({
            ...prompt,
            id: this.env.idGenerator.generateId(),
            semanticParts: newParts,
          });
        } else {
          returnedNodes.push(node);
        }
        continue;
      }

      // 2. Squash Model Thoughts
      if (node.type === 'AGENT_THOUGHT') {
        const thought = node;
        const squashResult = this.tryApplySquash(thought.text, limitChars, currentDeficit);
        
        if (squashResult) {
          currentDeficit -= squashResult.tokensSaved;
          returnedNodes.push({
            ...thought,
            id: this.env.idGenerator.generateId(),
            text: squashResult.text,
          });
        } else {
          returnedNodes.push(node);
        }
        continue;
      }

      // 3. Squash Agent Yields
      if (node.type === 'AGENT_YIELD') {
        const agentYield = node;
        const squashResult = this.tryApplySquash(agentYield.text, limitChars, currentDeficit);

        if (squashResult) {
          currentDeficit -= squashResult.tokensSaved;
          returnedNodes.push({
            ...agentYield,
            id: this.env.idGenerator.generateId(),
            text: squashResult.text,
          });
        } else {
          returnedNodes.push(node);
        }
        continue;
      }

      returnedNodes.push(node);
    }

    return returnedNodes;
  }
}
