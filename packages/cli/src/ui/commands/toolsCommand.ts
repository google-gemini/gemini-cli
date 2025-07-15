/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type CommandContext, type SlashCommand } from './types.js';
import { MessageType } from '../types.js';

export const toolsCommand: SlashCommand = {
  name: 'tools',
  description: 'list available Gemini CLI tools',
  action: async (context: CommandContext, args?: string): Promise<void> => {
    const subCommand = args?.trim();

    // Default to NOT showing descriptions. The user must opt in with an argument.
    let useShowDescriptions = false;
    if (subCommand === 'desc' || subCommand === 'descriptions') {
      useShowDescriptions = true;
    }

    const toolRegistry = await context.services.config?.getToolRegistry();
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
        const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*.{0,2}(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        if (useShowDescriptions && tool.description) {
          // Format tool name in cyan
          message += `  - \u001b[36m${stripAnsi(tool.displayName)} (${stripAnsi(tool.name)})\u001b[0m:\n`;

          // Apply green color to the description text
          const greenColor = '\u001b[32m';
          const resetColor = '\u001b[0m';

          // Handle multi-line descriptions
          const descLines = tool.description.trim().split('\n');
          for (const descLine of descLines) {
            message += `      ${greenColor}${stripAnsi(descLine)}${resetColor}\n`;
          }
        } else {
          // Use cyan color for the tool name
          message += `  - \u001b[36m${stripAnsi(tool.displayName)}\u001b[0m\n`;
        }
      });
    } else {
      message += '  No tools available\n';
    }
    message += '\n';

    // Reset any ANSI formatting
    message += '\u001b[0m';

    context.ui.addItem({ type: MessageType.INFO, text: message }, Date.now());
  },
};
