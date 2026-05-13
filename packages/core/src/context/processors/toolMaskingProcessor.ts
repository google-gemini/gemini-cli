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
import type { ConcreteNode } from '../graph/types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { sanitizeFilenamePart } from '../../utils/fileUtils.js';
import {
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
} from '../../tools/tool-names.js';
import {
  updatePart,
  cloneFunctionCall,
  cloneFunctionResponse,
} from '../../utils/partUtils.js';

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
        if (node.type !== 'TOOL_EXECUTION') {
          returnedNodes.push(node);
          continue;
        }

        const payload = node.payload;
        const toolName =
          payload.functionCall?.name || payload.functionResponse?.name;

        if (toolName && UNMASKABLE_TOOLS.has(toolName)) {
          returnedNodes.push(node);
          continue;
        }

        const callId =
          payload.functionCall?.id || payload.functionResponse?.id || 'unknown';

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

        if (payload.functionCall) {
          const rawIntent = payload.functionCall.args;
          if (isMaskableRecord(rawIntent)) {
            const res = await maskAsync(rawIntent, 'intent');
            if (res.changed) {
              const newFC = cloneFunctionCall(payload.functionCall);
              let maskedRecord: Record<string, unknown>;
              if (isMaskableRecord(res.masked)) {
                maskedRecord = res.masked;
              } else {
                maskedRecord = { message: String(res.masked) };
              }
              newFC.args = maskedRecord;

              const maskedPart = updatePart(payload, {
                functionCall: newFC,
              });

              returnedNodes.push({
                ...node,
                id: randomUUID(),
                payload: maskedPart,
                replacesId: node.id,
                turnId: node.turnId,
              });
              continue;
            }
          }
        } else if (payload.functionResponse) {
          const rawObs = payload.functionResponse.response;
          if (isMaskableValue(rawObs)) {
            const res = await maskAsync(rawObs, 'observation');
            if (res.changed) {
              const newFR = cloneFunctionResponse(payload.functionResponse);
              let maskedRecord: Record<string, unknown>;
              if (isMaskableRecord(res.masked)) {
                maskedRecord = res.masked;
              } else {
                maskedRecord = { message: String(res.masked) };
              }
              newFR.response = maskedRecord;

              const maskedPart = updatePart(payload, {
                functionResponse: newFR,
              });

              returnedNodes.push({
                ...node,
                id: randomUUID(),
                payload: maskedPart,
                replacesId: node.id,
                turnId: node.turnId,
              });
              continue;
            }
          }
        }

        returnedNodes.push(node);
      }

      return returnedNodes;
    },
  };
}
