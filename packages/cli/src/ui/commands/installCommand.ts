/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandContext } from './types.js';

export const installCommand: SlashCommand = {
  name: 'install',
  description: 'install VS Code themes from marketplace URLs',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!args.trim()) {
      return {
        type: 'submit_prompt',
        content: `I need help installing a VS Code theme. Please provide a VS Code marketplace URL to install a theme from.

Usage: /install <marketplace-url>

Example: /install https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code

The URL should be from the VS Code marketplace and point to a theme extension.`,
      };
    }

    // Extract URL from args
    const urlMatch = args.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) {
      return {
        type: 'submit_prompt',
        content: `I couldn't find a valid URL in your input. Please provide a valid VS Code marketplace URL.

Example: /install https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code`,
      };
    }

    const marketplaceUrl = urlMatch[1];
    
    return {
      type: 'submit_prompt',
      content: `I'll help you install a VS Code theme from the marketplace URL you provided: ${marketplaceUrl}

Let me download and extract the theme from this VS Code marketplace extension, then create a custom theme configuration for Gemini CLI.

Please wait while I process this request...`,
    };
  },
}; 