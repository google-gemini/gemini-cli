/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextAccountingState, ContextProcessor } from '../pipeline.js';
import type { ContextEnvironment } from '../sidecar/environment.js';
import { estimateTokenCountSync } from '../../utils/tokenCalculation.js';
import { sanitizeFilenamePart } from '../../utils/fileUtils.js';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import {
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
} from '../../tools/tool-names.js';
import type { Episode } from '../ir/types.js';

const UNMASKABLE_TOOLS = new Set([
  ACTIVATE_SKILL_TOOL_NAME,
  MEMORY_TOOL_NAME,
  ASK_USER_TOOL_NAME,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
]);

export class ToolMaskingProcessor implements ContextProcessor {
  readonly name = 'ToolMasking';
  private env: ContextEnvironment;
  private options: { stringLengthThresholdTokens: number };

  constructor(env: ContextEnvironment, options: { stringLengthThresholdTokens: number }) {
    this.env = env;
    this.options = options;
  }

  async process(
    episodes: Episode[],
    state: ContextAccountingState,
  ): Promise<Episode[]> {
    
    const maskingConfig =
      this.options;
    if (!maskingConfig) return episodes;
    if (state.isBudgetSatisfied) return episodes;

    const newEpisodes = [...episodes];
    let currentDeficit = state.deficitTokens;
    const limitChars = maskingConfig.stringLengthThresholdTokens * 4;

    let toolOutputsDir = path.join(
      this.env.getProjectTempDir(),
      'tool-outputs',
    );
    const sessionId = this.env.getSessionId();
    if (sessionId) {
      toolOutputsDir = path.join(
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
        await fsPromises.mkdir(toolOutputsDir, { recursive: true });
        directoryCreated = true;
      }

      const fileName = `${sanitizeFilenamePart(toolName).toLowerCase()}_${sanitizeFilenamePart(callId).toLowerCase()}_${nodeType}_${Math.random().toString(36).substring(7)}.txt`;
      const filePath = path.join(toolOutputsDir, fileName);

      await fsPromises.writeFile(filePath, content, 'utf-8');

      const fileSizeMB = (
        Buffer.byteLength(content, 'utf8') /
        1024 /
        1024
      ).toFixed(2);
      const totalLines = content.split('\n').length;
      return `<tool_output_masked>\n[Tool ${nodeType} string (${fileSizeMB}MB, ${totalLines} lines) masked to preserve context window. Full string saved to: ${filePath}]\n</tool_output_masked>`;
    };

    // Forward scan, looking for massive intents or observations to mask
    for (let i = 0; i < newEpisodes.length; i++) {
      if (currentDeficit <= 0) break;
      const ep = newEpisodes[i];
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
            require('fs').appendFileSync('/tmp/debug.json', 'STRING FOUND. length: ' + obj.length + ' limitChars: ' + limitChars + '\n');
            if (obj.length > 1000) console.log('Found string of length:', obj.length, 'limitChars is:', limitChars, 'isAlreadyMasked:', this.isAlreadyMasked(obj));
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
          step.presentation.intent = intentRes.masked;
          step.presentation.observation = obsRes.masked;

          // Recalculate tokens perfectly
          const newIntentTokens = estimateTokenCountSync([
            {
              functionCall: {
                name: toolName,
                args: intentRes.masked,
                id: callId,
              },
            },
          ]);
          const newObsTokens = estimateTokenCountSync([
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
            step.presentation.tokens = {
              intent: newIntentTokens,
              observation: newObsTokens,
            };
            step.metadata.transformations.push({
              processorName: 'ToolMasking',
              action: 'MASKED',
              timestamp: Date.now(),
            });
            currentDeficit -= savings;
          }
        }
      }
    }

    return newEpisodes;
  }

  private isAlreadyMasked(content: string): boolean {
    return content.includes('<tool_output_masked>');
  }
}
