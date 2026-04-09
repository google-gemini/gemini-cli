/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { truncateProportionally } from '../truncation.js';
import type { ConcreteNode } from '../ir/types.js';

export interface NodeTruncationProcessorOptions {
  maxTokensPerNode: number;
}

export class NodeTruncationProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    options: NodeTruncationProcessorOptions,
  ): NodeTruncationProcessor {
    return new NodeTruncationProcessor(env, options);
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

  readonly id = 'NodeTruncationProcessor';
  readonly name = 'NodeTruncationProcessor';
  readonly options: NodeTruncationProcessorOptions;
  private env: ContextEnvironment;

  constructor(
    env: ContextEnvironment,
    options: NodeTruncationProcessorOptions,
  ) {
    this.env = env;
    this.options = options;
  }

  private tryApplySquash(
    text: string,
    limitChars: number,
  ): { text: string; newTokens: number; oldTokens: number; tokensSaved: number } | null {
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

  async process({ targets }: ProcessArgs): Promise<readonly ConcreteNode[]> {
    if (targets.length === 0) {
      return targets;
    }

    const { maxTokensPerNode } = this.options;
    const limitChars = this.env.tokenCalculator.tokensToChars(maxTokensPerNode);

    const returnedNodes: ConcreteNode[] = [];

    for (const node of targets) {
      // 1. Squash User Prompts
      if (node.type === 'USER_PROMPT') {
        const prompt = node;
        let modified = false;
        const newParts = [...prompt.semanticParts];

        for (let j = 0; j < prompt.semanticParts.length; j++) {
          const part = prompt.semanticParts[j];
          if (part.type === 'text') {
            const squashResult = this.tryApplySquash(part.text, limitChars);
            if (squashResult) {
              newParts[j] = { type: 'text', text: squashResult.text };
              modified = true;
            }
          }
        }

        if (modified) {
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
        const squashResult = this.tryApplySquash(thought.text, limitChars);

        if (squashResult) {
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
        const squashResult = this.tryApplySquash(agentYield.text, limitChars);

        if (squashResult) {
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
