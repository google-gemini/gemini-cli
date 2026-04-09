/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextProcessor, ProcessArgs } from '../pipeline.js';
import type { ConcreteNode, ToolExecution } from '../ir/types.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { sanitizeFilenamePart } from '../../utils/fileUtils.js';
import {
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
} from '../../tools/tool-names.js';
import type { Part } from '@google/genai';

const UNMASKABLE_TOOLS = new Set([
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
]);

export interface ToolMaskingProcessorOptions {
  stringLengthThresholdTokens: number;
}

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

export class ToolMaskingProcessor implements ContextProcessor {
  static create(
    env: ContextEnvironment,
    options: ToolMaskingProcessorOptions,
  ): ToolMaskingProcessor {
    return new ToolMaskingProcessor(env, options);
  }

  static readonly schema = {
    type: 'object',
    properties: {
      stringLengthThresholdTokens: {
        type: 'number',
        description:
          'The token threshold above which tool intents/observations are masked.',
      },
    },
    required: ['stringLengthThresholdTokens'],
  };

  readonly componentType = 'processor';
  readonly id = 'ToolMaskingProcessor';
  readonly name = 'ToolMaskingProcessor';
  readonly options: ToolMaskingProcessorOptions;
  private env: ContextEnvironment;

  constructor(env: ContextEnvironment, options: ToolMaskingProcessorOptions) {
    this.env = env;
    this.options = options;
  }

  private isAlreadyMasked(text: string): boolean {
    return text.includes('<tool_output_masked>');
  }

  async process({ targets }: ProcessArgs): Promise<readonly ConcreteNode[]> {
    const maskingConfig = this.options;
    if (!maskingConfig) return targets;
    if (targets.length === 0) return targets;

    const limitChars = this.env.tokenCalculator.tokensToChars(
      maskingConfig.stringLengthThresholdTokens,
    );

    let toolOutputsDir = this.env.fileSystem.join(
      this.env.projectTempDir,
      'tool-outputs',
    );
    const sessionId = this.env.sessionId;
    if (sessionId) {
      toolOutputsDir = this.env.fileSystem.join(
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
        await this.env.fileSystem.mkdir(toolOutputsDir, { recursive: true });
        directoryCreated = true;
      }

      const fileName = `${sanitizeFilenamePart(toolName).toLowerCase()}_${sanitizeFilenamePart(callId).toLowerCase()}_${nodeType}_${this.env.idGenerator.generateId()}.txt`;
      const filePath = this.env.fileSystem.join(toolOutputsDir, fileName);

      await this.env.fileSystem.writeFile(filePath, content);

      const fileSizeMB = (
        Buffer.byteLength(content, 'utf8') /
        1024 /
        1024
      ).toFixed(2);
      const totalLines = content.split('\n').length;
      return `<tool_output_masked>\n[Tool ${nodeType} string (${fileSizeMB}MB, ${totalLines} lines) masked to preserve context window. Full string saved to: ${filePath}]\n</tool_output_masked>`;
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
              if (obj.length > limitChars && !this.isAlreadyMasked(obj)) {
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
            // Handle observation explicitly as string vs object
            const maskedObs =
              typeof obsRes.masked === 'string'
                ? ({ message: obsRes.masked } as Record<string, unknown>)
                : isMaskableRecord(obsRes.masked)
                  ? (obsRes.masked as Record<string, unknown>)
                  : undefined;

            const newIntentTokens =
              this.env.tokenCalculator.estimateTokensForParts([
                {
                  functionCall: {
                    name: toolName || 'unknown',
                    args: maskedIntent,
                    id: callId,
                  },
                },
              ]);

            let obsPart: Record<string, unknown> = {};
            if (maskedObs) {
              obsPart = {
                functionResponse: {
                  name: toolName || 'unknown',
                  response: maskedObs,
                  id: callId,
                },
              };
            }

            const newObsTokens =
              this.env.tokenCalculator.estimateTokensForParts([
                obsPart as Part,
              ]);

            const tokensSaved =
              this.env.tokenCalculator.getTokenCost(node) -
              (newIntentTokens + newObsTokens);

            if (tokensSaved > 0) {
              const maskedNode: ToolExecution = {
                ...node,
                id: this.env.idGenerator.generateId(), // Modified, so generate new ID
                intent: maskedIntent ?? node.intent,
                observation: maskedObs ?? node.observation,
                tokens: {
                  intent: newIntentTokens,
                  observation: newObsTokens,
                },
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
  }
}
