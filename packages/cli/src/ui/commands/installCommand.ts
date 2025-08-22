/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, SlashCommandActionReturn, CommandContext } from './types.js';
import { themeInstaller, type Installer } from './installers/themeInstaller.js';

export const installCommand: SlashCommand = {
  name: 'install',
  description: 'install VS Code themes from marketplace URLs',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
  // Registry of available installers. Keep lightweight and local for now.
  const installers: Installer[] = [themeInstaller];

    if (!args.trim()) {
      return {
        type: 'submit_prompt',
        content: `I need help installing a VS Code theme. Please provide a VS Code marketplace URL to install a theme from.

Usage: /install <marketplace-url>

Example: /install https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code

The URL should be from the VS Code marketplace and point to a theme extension.`,
      };
    }

    // Extract URL from args (current default flow expects a theme URL)
    const urlMatch = args.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) {
      return {
        type: 'submit_prompt',
        content: `I couldn't find a valid URL in your input. Please provide a valid VS Code marketplace URL.

Example: /install https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code`,
      };
    }

    // Delegate to the first matching installer
    const installer = installers.find((i) => i.matches(args));
    if (installer) {
      return installer.run(context, args);
    }

    // Fallback (shouldn't happen with current theme installer present)
    return {
      type: 'submit_prompt',
      content:
        `I couldn't find a suitable installer for your input. Please provide a VS Code marketplace URL.`,
    };
  },
}; 