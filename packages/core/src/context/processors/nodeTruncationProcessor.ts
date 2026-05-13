/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { truncateProportionally } from '../truncation.js';
import type { ConcreteNode } from '../graph/types.js';

export interface NodeTruncationProcessorOptions {
  maxTokensPerNode: number;
}

export const NodeTruncationProcessorOptionsSchema: JSONSchemaType<NodeTruncationProcessorOptions> =
  {
    type: 'object',
    properties: {
      maxTokensPerNode: { type: 'number' },
    },
    required: ['maxTokensPerNode'],
  };

export function createNodeTruncationProcessor(
  id: string,
  env: ContextEnvironment,
  options: NodeTruncationProcessorOptions,
): ContextProcessor {
  const tryApplySquash = (
    text: string,
    limitChars: number,
  ): {
    text: string;
    newTokens: number;
    oldTokens: number;
    tokensSaved: number;
  } | null => {
    const originalLength = text.length;
    if (originalLength <= limitChars) return null;

    const newText = truncateProportionally(
      text,
      limitChars,
      `\n\n[... OMITTED ${originalLength - limitChars} chars ...]\n\n`,
    );

    if (newText !== text) {
      // Using accurate TokenCalculator instead of simple math
      const newTokens = env.tokenCalculator.estimateTokensForString(newText);
      const oldTokens = env.tokenCalculator.estimateTokensForString(text);
      const tokensSaved = oldTokens - newTokens;

      if (tokensSaved > 0) {
        return { text: newText, newTokens, oldTokens, tokensSaved };
      }
    }
    return null;
  };

  return {
    id,
    name: 'NodeTruncationProcessor',
    process: async ({ targets }: ProcessArgs) => {
      if (targets.length === 0) {
        return targets;
      }

      const { maxTokensPerNode } = options;
      const limitChars = env.tokenCalculator.tokensToChars(maxTokensPerNode);

      const returnedNodes: ConcreteNode[] = [];

      for (const node of targets) {
        const payload = node.payload;
        const text = payload.text;

        if (text) {
          const squashResult = tryApplySquash(text, limitChars);
          if (squashResult) {
            returnedNodes.push({
              ...node,
              id: randomUUID(),
              payload: { ...payload, text: squashResult.text },
              replacesId: node.id,
              turnId: node.turnId,
            });
            continue;
          }
        }

        returnedNodes.push(node);
      }

      return returnedNodes;
    },
  };
}
