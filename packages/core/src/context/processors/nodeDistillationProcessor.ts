/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ConcreteNode } from '../ir/types.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { getResponseText } from '../../utils/partUtils.js';

import { LlmRole } from '../../telemetry/llmRole.js';

export interface NodeDistillationProcessorOptions {
  nodeThresholdTokens: number;
}

export class NodeDistillationProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    options: NodeDistillationProcessorOptions,
  ): NodeDistillationProcessor {
    return new NodeDistillationProcessor(env, options);
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

  readonly componentType = 'processor';
  readonly id = 'NodeDistillationProcessor';
  readonly name = 'NodeDistillationProcessor';
  readonly options: NodeDistillationProcessorOptions;
  private env: ContextEnvironment;

  constructor(
    env: ContextEnvironment,
    options: NodeDistillationProcessorOptions,
  ) {
    this.env = env;
    this.options = options;
  }

  private async generateSummary(
    text: string,
    contextInfo: string,
  ): Promise<string> {
    try {
      const response = await this.env.llmClient.generateContent({
        role: LlmRole.UTILITY_COMPRESSOR,
        modelConfigKey: { model: 'gemini-3-flash-base' },
        promptId: this.env.promptId,
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
  }

  async process({ targets }: ProcessArgs): Promise<readonly ConcreteNode[]> {
    const semanticConfig = this.options;
    const limitTokens = semanticConfig.nodeThresholdTokens;
    const thresholdChars = this.env.tokenCalculator.tokensToChars(limitTokens);

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
              const summary = await this.generateSummary(
                part.text,
                'User Prompt',
              );
              const newTokens = this.env.tokenCalculator.estimateTokensForParts(
                [{ text: summary }],
              );
              const oldTokens = this.env.tokenCalculator.estimateTokensForParts(
                [{ text: part.text }],
              );

              if (newTokens < oldTokens) {
                newParts[j] = { type: 'text', text: summary };
                modified = true;
              }
            }
          }

          if (modified) {
            returnedNodes.push({
              ...node,
              id: this.env.idGenerator.generateId(),
              semanticParts: newParts,
            });
          } else {
            returnedNodes.push(node);
          }
          break;
        }

        case 'AGENT_THOUGHT': {
          if (node.text.length > thresholdChars) {
            const summary = await this.generateSummary(
              node.text,
              'Agent Thought',
            );
            const newTokens = this.env.tokenCalculator.estimateTokensForParts([
              { text: summary },
            ]);
            const oldTokens = this.env.tokenCalculator.getTokenCost(node);

            if (newTokens < oldTokens) {
              returnedNodes.push({
                ...node,
                id: this.env.idGenerator.generateId(),
                text: summary,
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
            const summary = await this.generateSummary(
              stringifiedObs,
              node.toolName || 'unknown',
            );
            const newObsObject = { summary };

            const newObsTokens =
              this.env.tokenCalculator.estimateTokensForParts([
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
              this.env.tokenCalculator.getTokenCost(node);
            const intentTokens = node.tokens?.intent ?? 0;

            if (newObsTokens < oldObsTokens) {
              returnedNodes.push({
                ...node,
                id: this.env.idGenerator.generateId(),
                observation: newObsObject as Record<string, unknown>,
                tokens: {
                  intent: intentTokens,
                  observation: newObsTokens,
                },
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
  }
}
