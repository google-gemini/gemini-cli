/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { randomUUID } from 'node:crypto';
import type { JSONSchemaType } from 'ajv';
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ConcreteNode, ToolExecution } from '../graph/types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { sanitizeFilenamePart } from '../../utils/fileUtils.js';
import {
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
} from '../../tools/tool-names.js';
import type { Part } from '@google/genai';

export interface ToolMaskingProcessorOptions {
  stringLengthThresholdTokens: number;
}

export const ToolMaskingProcessorOptionsSchema: JSONSchemaType<ToolMaskingProcessorOptions> =
  {
    type: 'object',
    properties: {
      stringLengthThresholdTokens: { type: 'number' },
    },
    required: ['stringLengthThresholdTokens'],
  };

const UNMASKABLE_TOOLS = new Set([
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
]);

type MaskableValue =
  | string
  | number
  | boolean
  | null
  | MaskableValue[]
  | { [key: string]: MaskableValue };

function isMaskableValue(val: unknown): val is MaskableValue {
  if (
    val === null ||
    typeof val === 'string' ||
    typeof val === 'number' ||
    typeof val === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(val)) {
    return val.every(isMaskableValue);
  }
  if (typeof val === 'object') {
    return Object.values(val).every(isMaskableValue);
  }
  return false;
}

function isMaskableRecord(val: unknown): val is Record<string, MaskableValue> {
  return (
    typeof val === 'object' &&
    val !== null &&
    !Array.isArray(val) &&
    isMaskableValue(val)
  );
}

export function createToolMaskingProcessor(
  id: string,
  env: ContextEnvironment,
  options: ToolMaskingProcessorOptions,
): ContextProcessor {
  const isAlreadyMasked = (text: string): boolean =>
    text.includes('<tool_output_masked>');

  return {
    id,
    name: 'ToolMaskingProcessor',
    process: async ({ targets }: ProcessArgs) => {
      const maskingConfig = options;
      if (!maskingConfig) return targets;
      if (targets.length === 0) return targets;

      const limitChars = env.tokenCalculator.tokensToChars(
        maskingConfig.stringLengthThresholdTokens,
      );

      let toolOutputsDir = path.join(env.projectTempDir, 'tool-outputs');
      const sessionId = env.sessionId;
      if (sessionId) {
        toolOutputsDir = path.join(
          toolOutputsDir,
          `session-${sanitizeFilenamePart(sessionId)}`,
        );
      }

      let directoryCreated = false;

      const handleMasking = async (
        content: string,
        toolName: string,
        callId: string,
        nodeType: string,
      ): Promise<string> => {
        if (!directoryCreated) {
          await fs.mkdir(toolOutputsDir, { recursive: true });
          directoryCreated = true;
        }

        const fileName = `${sanitizeFilenamePart(toolName).toLowerCase()}_${sanitizeFilenamePart(callId).toLowerCase()}_${nodeType}_${randomUUID()}.txt`;
        const filePath = path.join(toolOutputsDir, fileName);

        await fs.writeFile(filePath, content);

        const fileSizeMB = (
          Buffer.byteLength(content, 'utf8') /
          1024 /
          1024
        ).toFixed(2);
        const totalLines = content.split('\n').length;

        // Ensure consistent path separators for LLM tokenization and deterministic tests across OSes
        const normalizedPath = filePath.split(path.sep).join('/');
        return `<tool_output_masked>\n[Tool ${nodeType} string (${fileSizeMB}MB, ${totalLines} lines) masked to preserve context window. Full string saved to: ${normalizedPath}]\n</tool_output_masked>`;
      };

      const returnedNodes: ConcreteNode[] = [];

      for (const node of targets) {
        switch (node.type) {
          case 'TOOL_EXECUTION': {
            const toolName = node.toolName;
            if (toolName && UNMASKABLE_TOOLS.has(toolName)) {
              returnedNodes.push(node);
              break;
            }

            const callId = node.id || Date.now().toString();

            const maskAsync = async (
              obj: MaskableValue,
              nodeType: string,
            ): Promise<{ masked: MaskableValue; changed: boolean }> => {
              if (typeof obj === 'string') {
                if (obj.length > limitChars && !isAlreadyMasked(obj)) {
                  const newString = await handleMasking(
                    obj,
                    toolName || 'unknown',
                    callId,
                    nodeType,
                  );
                  return { masked: newString, changed: true };
                }
                return { masked: obj, changed: false };
              }
              if (Array.isArray(obj)) {
                let changed = false;
                const masked: MaskableValue[] = [];
                for (const item of obj) {
                  const res = await maskAsync(item, nodeType);
                  if (res.changed) changed = true;
                  masked.push(res.masked);
                }
                return { masked, changed };
              }
              if (typeof obj === 'object' && obj !== null) {
                let changed = false;
                const masked: Record<string, MaskableValue> = {};
                for (const [key, value] of Object.entries(obj)) {
                  const res = await maskAsync(value, nodeType);
                  if (res.changed) changed = true;
                  masked[key] = res.masked;
                }
                return { masked, changed };
              }
              return { masked: obj, changed: false };
            };

            const rawIntent = node.intent;
            const rawObs = node.observation;

            if (!isMaskableRecord(rawIntent) || !isMaskableValue(rawObs)) {
              returnedNodes.push(node);
              break;
            }

            const intentRes = await maskAsync(rawIntent, 'intent');
            const obsRes = await maskAsync(rawObs, 'observation');

            if (intentRes.changed || obsRes.changed) {
              const maskedIntent = isMaskableRecord(intentRes.masked)
                ? (intentRes.masked as Record<string, unknown>)
                : undefined;
              // Ensure we strictly preserve the original intent if it was unchanged and is a record
              const finalIntent = intentRes.changed
                ? maskedIntent
                : isMaskableRecord(rawIntent)
                  ? (rawIntent as Record<string, unknown>)
                  : undefined;

              // Handle observation explicitly as string vs object
              const maskedObs =
                typeof obsRes.masked === 'string'
                  ? ({ message: obsRes.masked } as Record<string, unknown>)
                  : isMaskableRecord(obsRes.masked)
                    ? (obsRes.masked as Record<string, unknown>)
                    : undefined;
              // Ensure we strictly preserve the original observation if it was unchanged
              const finalObs = obsRes.changed
                ? maskedObs
                : typeof rawObs === 'string'
                  ? ({ message: rawObs } as Record<string, unknown>)
                  : isMaskableRecord(rawObs)
                    ? (rawObs as Record<string, unknown>)
                    : undefined;

              const newIntentTokens =
                env.tokenCalculator.estimateTokensForParts([
                  {
                    functionCall: {
                      name: toolName || 'unknown',
                      args: finalIntent,
                      id: callId,
                    },
                  },
                ]);

              let obsPart: Record<string, unknown> = {};
              if (maskedObs) {
                obsPart = {
                  functionResponse: {
                    name: toolName || 'unknown',
                    response: finalObs,
                    id: callId,
                  },
                };
              }

              const newObsTokens = env.tokenCalculator.estimateTokensForParts([
                obsPart as Part,
              ]);

              const tokensSaved =
                env.tokenCalculator.getTokenCost(node) -
                (newIntentTokens + newObsTokens);

              if (tokensSaved > 0) {
                const maskedNode: ToolExecution = {
                  ...node,
                  id: randomUUID(), // Modified, so generate new ID
                  intent: finalIntent ?? node.intent,
                  observation: finalObs ?? node.observation,
                  tokens: {
                    intent: newIntentTokens,
                    observation: newObsTokens,
                  },
                  replacesId: node.id,
                };

                returnedNodes.push(maskedNode);
              } else {
                returnedNodes.push(node);
              }
            } else {
              returnedNodes.push(node);
            }
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
