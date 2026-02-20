/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration } from '@google/genai';
import type { Config } from '../config/config.js';
import { LlmRole } from '../telemetry/types.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface ToolPreselectionOptions {
  maxTools?: number;
  modelConfigKey?: string;
}

/**
 * Service to pre-select a relevant subset of tools for a given query.
 * This helps reduce context size by excluding unneeded tool descriptions.
 */
export class ToolPreselectionService {
  constructor(private readonly config: Config) {}

  /**
   * Selects relevant tools for a query.
   *
   * @param query The user's query or task description.
   * @param tools The full list of available function declarations.
   * @param signal AbortSignal for the request.
   * @param options Optional configuration for pre-selection.
   * @returns A list of tool names that are considered relevant.
   */
  async selectTools(
    query: string,
    tools: FunctionDeclaration[],
    signal: AbortSignal,
    options: ToolPreselectionOptions = {},
  ): Promise<string[]> {
    if (tools.length === 0) {
      return [];
    }

    // Threshold below which we don't bother with pre-selection.
    const threshold = options.maxTools ?? 5;
    if (tools.length <= threshold) {
      return tools.filter((t) => !!t.name).map((t) => t.name!);
    }

    const schema = {
      type: 'object',
      properties: {
        relevant_tools: {
          type: 'array',
          items: { type: 'string' },
          description:
            'The names of the tools that are relevant to the user request.',
        },
      },
      required: ['relevant_tools'],
    };

    const toolsList = tools
      .map((_t) => `- ${_t.name}: ${_t.description}`)
      .join('\n');

    const prompt = `Given the following user request and a list of available tools, select only the tools that are strictly necessary to solve the request.
Return the result as a JSON array of tool names.

Request: ${query}

Available Tools:
${toolsList}`;

    try {
      const llmClient = this.config.getBaseLlmClient();
      const modelConfigKey = options.modelConfigKey || 'classifier';

      const result = await llmClient.generateJson({
        modelConfigKey: { model: modelConfigKey },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        schema: schema as Record<string, unknown>,
        abortSignal: signal,
        promptId: 'tool-preselection',
        role: LlmRole.UTILITY_TOOL,
      });

      const selectedTools = result['relevant_tools'];

      if (
        !Array.isArray(selectedTools) ||
        !selectedTools.every((item): item is string => typeof item === 'string')
      ) {
        throw new Error(
          'Tool preselection returned invalid data format. Expected an array of strings.',
        );
      }

      debugLogger.debug(
        `ToolPreselectionService: Selected ${selectedTools.length} tools out of ${tools.length} for query: "${query.substring(0, 50)}..."`,
      );
      return selectedTools;
    } catch (error) {
      debugLogger.error('ToolPreselectionService failed:', error);
      // Fallback: return all tools if pre-selection fails.
      return tools.filter((t) => !!t.name).map((t) => t.name!);
    }
  }
}
