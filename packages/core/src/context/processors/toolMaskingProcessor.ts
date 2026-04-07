/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextAccountingState, ContextProcessor } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';

import { sanitizeFilenamePart } from '../../utils/fileUtils.js';
import {
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
} from '../../tools/tool-names.js';

const UNMASKABLE_TOOLS = new Set([
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
]);

import type { EpisodeEditor } from '../ir/episodeEditor.js';

export interface ToolMaskingProcessorOptions {
  stringLengthThresholdTokens: number;
}

export class ToolMaskingProcessor implements ContextProcessor {
  static create(env: ContextEnvironment, options: ToolMaskingProcessorOptions): ToolMaskingProcessor {
    return new ToolMaskingProcessor(env, options);
  }

  static readonly schema = {
    type: 'object',
    properties: {
      stringLengthThresholdTokens: {
        type: 'number',
        description: 'The token threshold above which tool intents/observations are masked.',
      },
    },
    required: ['stringLengthThresholdTokens'],
  };

  readonly id = 'ToolMaskingProcessor';
  readonly name = 'ToolMaskingProcessor';
  readonly options: ToolMaskingProcessorOptions;
  private env: ContextEnvironment;

  constructor(
    env: ContextEnvironment,
    options: ToolMaskingProcessorOptions,
  ) {
    this.env = env;
    this.options = options;
  }

  async process(
    editor: EpisodeEditor,
    state: ContextAccountingState,
  ): Promise<void> {
    const maskingConfig = this.options;
    if (!maskingConfig) return;
    if (state.isBudgetSatisfied) return;

    let currentDeficit = state.deficitTokens;
    const limitChars = this.env.tokenCalculator.tokensToChars(maskingConfig.stringLengthThresholdTokens);

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

    // We only create the directory if we actually mask something
    let directoryCreated = false;

    // Helper to extract string and write to disk
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

    // Forward scan, looking for massive intents or observations to mask
    for (const ep of editor.episodes) {
      if (currentDeficit <= 0) break;
      if (!ep || !ep.steps || state.protectedEpisodeIds.has(ep.id)) continue;

      for (let j = 0; j < ep.steps.length; j++) {
        if (currentDeficit <= 0) break;
        const step = ep.steps[j];
        if (step.type !== 'TOOL_EXECUTION') continue;

        const toolName = step.toolName;
        if (toolName && UNMASKABLE_TOOLS.has(toolName)) continue;

        // Ensure presentation object exists
        if (!step.presentation) {
          step.presentation = {
            intent: step.intent,
            observation: step.observation,
            tokens: step.tokens, // Fallback to raw tokens initially
          };
        }

        const callId = step.id || Date.now().toString();

        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */

        const maskAsync = async (
          obj: any,
          nodeType: string,
        ): Promise<{ masked: any; changed: boolean }> => {
          if (typeof obj === 'string') {
            if (obj.length > limitChars && !this.isAlreadyMasked(obj)) {
              const newString = await handleMasking(
                obj,
                toolName,
                callId,
                nodeType,
              );
              return { masked: newString, changed: true };
            }
            return { masked: obj, changed: false };
          }
          if (Array.isArray(obj)) {
            let changed = false;
            const masked = [];
            for (const item of obj) {
              const res = await maskAsync(item, nodeType);
              if (res.changed) changed = true;
              masked.push(res.masked);
            }
            return { masked, changed };
          }
          if (typeof obj === 'object' && obj !== null) {
            let changed = false;
            const masked: Record<string, any> = {};
            for (const [key, value] of Object.entries(obj)) {
              const res = await maskAsync(value, nodeType);
              if (res.changed) changed = true;
              masked[key] = res.masked;
            }
            return { masked, changed };
          }
          return { masked: obj, changed: false };
        };

        const intentRes = await maskAsync(
          step.presentation.intent ?? step.intent,
          'intent',
        );
        const obsRes = await maskAsync(
          step.presentation.observation ?? step.observation,
          'observation',
        );

        if (intentRes.changed || obsRes.changed) {
          // Recalculate tokens perfectly
          const newIntentTokens = this.env.tokenCalculator.estimateTokensForParts([
            {
              functionCall: {
                name: toolName,
                args: intentRes.masked,
                id: callId,
              },
            },
          ]);
          const newObsTokens = this.env.tokenCalculator.estimateTokensForParts([
            {
              functionResponse: {
                name: toolName,
                response: obsRes.masked,
                id: callId,
              },
            },
          ]);

          const oldTotal =
            step.presentation.tokens?.intent !== undefined
              ? step.presentation.tokens.intent +
                step.presentation.tokens.observation
              : step.tokens.intent + step.tokens.observation;

          const newTotal = newIntentTokens + newObsTokens;
          const savings = oldTotal - newTotal;

          if (savings > 0) {
            currentDeficit -= savings;
            this.env.tracer.logEvent('ToolMaskingProcessor', `Masked tool ${toolName}`, { recoveredTokens: savings });
            
            editor.editEpisode(ep.id, 'MASK_TOOL', (draft) => {
              const draftStep = draft.steps[j];
              if (draftStep.type !== 'TOOL_EXECUTION') return;
              if (!draftStep.presentation) {
                 draftStep.presentation = {
                    intent: draftStep.intent,
                    observation: draftStep.observation,
                    tokens: draftStep.tokens,
                 };
              }
              draftStep.presentation.intent = intentRes.masked;
              draftStep.presentation.observation = obsRes.masked;
              draftStep.presentation.tokens = {
                intent: newIntentTokens,
                observation: newObsTokens,
              };
              draftStep.metadata = {
                ...draftStep.metadata,
                transformations: [
                  ...(draftStep.metadata?.transformations || []),
                  {
                    processorName: 'ToolMasking',
                    action: 'MASKED',
                    timestamp: Date.now(),
                  }
                ]
              };
            });
          }
        }
      }
    }
  }

  private isAlreadyMasked(content: string): boolean {
    return content.includes('<tool_output_masked>');
  }
}
