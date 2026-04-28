/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ConcreteNode } from '../graph/types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { getResponseText } from '../../utils/partUtils.js';
import { LlmRole } from '../../telemetry/llmRole.js';

export interface NodeDistillationProcessorOptions {
  nodeThresholdTokens: number;
}

export const NodeDistillationProcessorOptionsSchema: JSONSchemaType<NodeDistillationProcessorOptions> =
  {
    type: 'object',
    properties: {
      nodeThresholdTokens: { type: 'number' },
    },
    required: ['nodeThresholdTokens'],
  };

export function createNodeDistillationProcessor(
  id: string,
  env: ContextEnvironment,
  options: NodeDistillationProcessorOptions,
): ContextProcessor {
  const generateSummary = async (
    text: string,
    contextInfo: string,
  ): Promise<string> => {
    try {
      const response = await env.llmClient.generateContent({
        role: LlmRole.UTILITY_COMPRESSOR,
        modelConfigKey: { model: 'gemini-3-flash-base' },
        promptId: env.promptId,
        abortSignal: new AbortController().signal,
        contents: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        systemInstruction: {
          role: 'system',
          parts: [
            {
              text: `You are an expert context compressor. Your job is to drastically shorten the following ${contextInfo} while preserving the absolute core semantic meaning, facts, and intent. Omit all conversational filler, pleasantries, or redundant information. Return ONLY the compressed summary.`,
            },
          ],
        },
      });
      return getResponseText(response) || text;
    } catch (e) {
      debugLogger.warn(
        `NodeDistillationProcessor failed to summarize ${contextInfo}`,
        e,
      );
      return text; // Fallback to original text on API failure
    }
  };

  return {
    id,
    name: 'NodeDistillationProcessor',
    process: async ({ targets }: ProcessArgs) => {
      const semanticConfig = options;
      const limitTokens = semanticConfig.nodeThresholdTokens;
      const thresholdChars = env.tokenCalculator.tokensToChars(limitTokens);

      const returnedNodes: ConcreteNode[] = [];

      // Scan the target working buffer and unconditionally apply the configured hyperparameter threshold
      for (const node of targets) {
        switch (node.type) {
          case 'USER_PROMPT': {
            let modified = false;
            const newParts = [...node.semanticParts];

            for (let j = 0; j < node.semanticParts.length; j++) {
              const part = node.semanticParts[j];
              if (part.type !== 'text') continue;

              if (part.text.length > thresholdChars) {
                const summary = await generateSummary(part.text, 'User Prompt');
                const newTokens = env.tokenCalculator.estimateTokensForParts([
                  { text: summary },
                ]);
                const oldTokens = env.tokenCalculator.estimateTokensForParts([
                  { text: part.text },
                ]);

                if (newTokens < oldTokens) {
                  newParts[j] = { type: 'text', text: summary };
                  modified = true;
                }
              }
            }

            if (modified) {
              returnedNodes.push({
                ...node,
                id: randomUUID(),
                semanticParts: newParts,
                replacesId: node.id,
              });
            } else {
              returnedNodes.push(node);
            }
            break;
          }

          case 'AGENT_THOUGHT': {
            if (node.text.length > thresholdChars) {
              const summary = await generateSummary(node.text, 'Agent Thought');
              const newTokens = env.tokenCalculator.estimateTokensForParts([
                { text: summary },
              ]);
              const oldTokens = env.tokenCalculator.getTokenCost(node);

              if (newTokens < oldTokens) {
                returnedNodes.push({
                  ...node,
                  id: randomUUID(),
                  text: summary,
                  replacesId: node.id,
                });
                break;
              }
            }
            returnedNodes.push(node);
            break;
          }

          case 'TOOL_EXECUTION': {
            const rawObs = node.observation;

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
              const summary = await generateSummary(
                stringifiedObs,
                node.toolName || 'unknown',
              );
              const newObsObject = { summary };

              const newObsTokens = env.tokenCalculator.estimateTokensForParts([
                {
                  functionResponse: {
                    name: node.toolName || 'unknown',
                    response: newObsObject,
                    id: node.id,
                  },
                },
              ]);

              const oldObsTokens =
                node.tokens?.observation ??
                env.tokenCalculator.getTokenCost(node);
              const intentTokens = node.tokens?.intent ?? 0;

              if (newObsTokens < oldObsTokens) {
                returnedNodes.push({
                  ...node,
                  id: randomUUID(),
                  observation: newObsObject,
                  tokens: {
                    intent: intentTokens,
                    observation: newObsTokens,
                  },
                  replacesId: node.id,
                });
                break;
              }
            }
            returnedNodes.push(node);
            break;
          }

          default:
            returnedNodes.push(node);
            break;
        }
      }

      return returnedNodes;
    },
  };
}
