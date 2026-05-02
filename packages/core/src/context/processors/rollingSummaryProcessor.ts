/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type {
  ContextProcessor,
  ProcessArgs,
  BackstopTargetOptions,
} from '../pipeline.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import {
  type ConcreteNode,
  type RollingSummary,
  NodeType,
} from '../graph/types.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { LlmRole } from '../../telemetry/llmRole.js';

export interface RollingSummaryProcessorOptions extends BackstopTargetOptions {
  systemInstruction?: string;
}

export const RollingSummaryProcessorOptionsSchema: JSONSchemaType<RollingSummaryProcessorOptions> =
  {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['incremental', 'freeNTokens', 'max'],
        nullable: true,
      },
      freeTokensTarget: { type: 'number', nullable: true },
      maxRollingSummaries: { type: 'number', nullable: true },
      systemInstruction: { type: 'string', nullable: true },
    },
    required: [],
  };

export function createRollingSummaryProcessor(
  id: string,
  env: ContextEnvironment,
  options: RollingSummaryProcessorOptions,
): ContextProcessor {
  const generateRollingSummary = async (
    nodes: ConcreteNode[],
  ): Promise<string> => {
    let transcript = '';
    for (const node of nodes) {
      const payload = node.payload;
      let nodeContent = '';
      if (payload.text) {
        nodeContent = payload.text;
      } else if (payload.functionCall) {
        nodeContent = `CALL: ${payload.functionCall.name}(${JSON.stringify(payload.functionCall.args)})`;
      } else if (payload.functionResponse) {
        nodeContent = `RESPONSE: ${JSON.stringify(payload.functionResponse.response)}`;
      }
      transcript += `[${node.type}]: ${nodeContent}\n`;
    }

    const systemPrompt =
      options.systemInstruction ??
      `You are an expert context compressor. Your job is to drastically shorten the provided conversational transcript while preserving the absolute core semantic meaning, facts, and intent. Omit all conversational filler, pleasantries, or redundant information. Return ONLY the compressed summary.`;

    const response = await env.llmClient.generateContent({
      role: LlmRole.UTILITY_COMPRESSOR,
      modelConfigKey: { model: 'gemini-3-flash-base' },
      promptId: env.promptId,
      abortSignal: new AbortController().signal,
      contents: [{ role: 'user', parts: [{ text: transcript }] }],
      systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    });

    const candidate = response.candidates?.[0];
    const textPart = candidate?.content?.parts?.[0];
    return textPart?.text || '';
  };

  return {
    id,
    name: 'RollingSummaryProcessor',
    process: async ({ targets }: ProcessArgs) => {
      if (targets.length === 0) return targets;

      const strategy = options.target ?? 'max';
      const nodesToSummarize: ConcreteNode[] = [];

      if (strategy === 'incremental') {
        // 'incremental' simply summarizes the minimum viable chunk (the oldest 2 nodes), ignoring token math.
        for (const node of targets) {
          if (node.id === targets[0].id && node.type === 'USER_PROMPT') {
            continue; // Keep system prompt
          }
          nodesToSummarize.push(node);
          if (nodesToSummarize.length >= 2) break; // We have enough for a minimum rolling summary
        }
      } else {
        let targetTokensToRemove = 0;
        if (strategy === 'freeNTokens') {
          targetTokensToRemove = options.freeTokensTarget ?? Infinity;
        } else if (strategy === 'max') {
          targetTokensToRemove = Infinity;
        }

        if (targetTokensToRemove > 0) {
          let deficitAccumulator = 0;
          for (const node of targets) {
            if (node.id === targets[0].id && node.type === 'USER_PROMPT') {
              continue; // Keep system prompt
            }
            nodesToSummarize.push(node);
            deficitAccumulator += env.tokenCalculator.getTokenCost(node);
            if (deficitAccumulator >= targetTokensToRemove) break;
          }
        }
      }

      if (nodesToSummarize.length < 2) return targets; // Not enough context to summarize

      try {
        // Synthesize the rolling summary synchronously
        const snapshotText = await generateRollingSummary(nodesToSummarize);
        const newId = randomUUID();

        const summaryNode: RollingSummary = {
          id: newId,
          turnId: newId,
          type: NodeType.ROLLING_SUMMARY,
          timestamp: nodesToSummarize[nodesToSummarize.length - 1].timestamp,
          role: 'user',
          payload: { text: snapshotText },
          abstractsIds: nodesToSummarize.map((n) => n.id),
        };

        const consumedIds = nodesToSummarize.map((n) => n.id);
        const returnedNodes = targets.filter(
          (t) => !consumedIds.includes(t.id),
        );
        const firstRemovedIdx = targets.findIndex((t) =>
          consumedIds.includes(t.id),
        );

        if (firstRemovedIdx !== -1) {
          const idx = Math.max(0, firstRemovedIdx);
          returnedNodes.splice(idx, 0, summaryNode);
        } else {
          returnedNodes.unshift(summaryNode);
        }

        return returnedNodes;
      } catch (e) {
        debugLogger.error('RollingSummaryProcessor failed sync backstop', e);
        return targets;
      }
    },
  };
}
