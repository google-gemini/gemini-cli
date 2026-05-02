/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import { type ConcreteNode, NodeType } from '../graph/types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { debugLogger } from '../../utils/debugLogger.js';
import {
  getResponseText,
  updatePart,
  cloneFunctionResponse,
} from '../../utils/partUtils.js';
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
    } catch (e: unknown) {
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
        const payload = node.payload;

        switch (node.type) {
          case NodeType.USER_PROMPT:
          case NodeType.AGENT_THOUGHT: {
            const text = payload.text;
            if (text && text.length > thresholdChars) {
              const summary = await generateSummary(text, node.type);
              const newTokens = env.tokenCalculator.estimateTokensForParts([
                { text: summary },
              ]);
              const oldTokens = env.tokenCalculator.estimateTokensForParts([
                { text },
              ]);

              if (newTokens < oldTokens) {
                const distilledPayload = updatePart(payload, { text: summary });

                returnedNodes.push({
                  ...node,
                  id: randomUUID(),
                  payload: distilledPayload,
                  replacesId: node.id,
                  timestamp: node.timestamp,
                  turnId: node.turnId,
                });
                break;
              }
            }
            returnedNodes.push(node);
            break;
          }

          case NodeType.TOOL_EXECUTION: {
            if (payload.functionResponse) {
              const rawObs = payload.functionResponse.response;
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
                  payload.functionResponse.name || 'unknown',
                );
                const newObsObject = { summary };

                const newFR = cloneFunctionResponse(payload.functionResponse);
                newFR.response = newObsObject;

                const newObsTokens = env.tokenCalculator.estimateTokensForParts(
                  [
                    {
                      functionResponse: newFR,
                    },
                  ],
                );

                const oldObsTokens = env.tokenCalculator.estimateTokensForParts(
                  [payload],
                );

                if (newObsTokens < oldObsTokens) {
                  const newFR = cloneFunctionResponse(payload.functionResponse);
                  newFR.response = newObsObject;

                  const distilledPayload = updatePart(payload, {
                    functionResponse: newFR,
                  });

                  returnedNodes.push({
                    ...node,
                    id: randomUUID(),
                    payload: distilledPayload,
                    replacesId: node.id,
                    timestamp: node.timestamp,
                    turnId: node.turnId,
                  });
                  break;
                }
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
