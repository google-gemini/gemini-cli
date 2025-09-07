/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';

export const toolsCommand: SlashCommand = {
  name: 'tools',
  description: 'list available Gemini CLI tools. Usage: /tools [desc|schema]',
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const lowerCaseArgs = (args || '').toLowerCase().split(/\s+/).filter(Boolean);

    const hasDesc =
      lowerCaseArgs.includes('desc') || lowerCaseArgs.includes('descriptions');
    const useShowSchema = lowerCaseArgs.includes('schema');

    // Show descriptions if `desc` or `schema` is present
    const useShowDescriptions = hasDesc || useShowSchema;

    const toolRegistry = context.services.config?.getToolRegistry();
    if (!toolRegistry) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Could not retrieve tool registry.',
        },
        Date.now(),
      );
      return;
    }

    const tools = toolRegistry.getAllTools();
    // Filter out MCP tools by checking for the absence of a serverName property
    const geminiTools = tools.filter((tool) => !('serverName' in tool));

    let message = 'Available Gemini CLI tools:\n\n';

    if (geminiTools.length > 0) {
      geminiTools.forEach((tool) => {
        if (useShowDescriptions && tool.description) {
          message += `  - \u001b[36m${tool.displayName} (${tool.name})\u001b[0m:\n`;

          const greenColor = '\u001b[32m';
          const resetColor = '\u001b[0m';

          // Handle multi-line descriptions
          const descLines = tool.description.trim().split('\n');
          for (const descLine of descLines) {
            message += `      ${greenColor}${descLine}${resetColor}\n`;
          }
        } else {
          message += `  - \u001b[36m${tool.displayName}\u001b[0m\n`;
        }

        const parameters =
          tool.schema.parametersJsonSchema ?? tool.schema.parameters;
        if (useShowSchema && parameters) {
          const cyanColor = '\u001b[36m';
          const greenColor = '\u001b[32m';
          const resetColor = '\u001b[0m';
          // Prefix the parameters in cyan
          message += `    ${cyanColor}Parameters:${resetColor}\n`;

          const paramsLines = JSON.stringify(parameters, null, 2)
            .trim()
            .split('\n');
          if (paramsLines) {
            for (const paramsLine of paramsLines) {
              message += `      ${greenColor}${paramsLine}${resetColor}\n`;
            }
          }
        }
      });
    } else {
      message += '  No tools available\n';
    }
    message += '\n';

    message += '\u001b[0m';

    context.ui.addItem({ type: MessageType.INFO, text: message }, Date.now());
  },
};
