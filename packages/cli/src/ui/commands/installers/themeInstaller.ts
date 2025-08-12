/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommandActionReturn } from '../types.js';

export interface Installer {
  /** Identifier for the installer (e.g., 'theme'). */
  name: string;
  /** Returns true if this installer can handle the given args. */
  matches: (args: string) => boolean;
  /** Execute the installer for the given args. */
  run: (
    context: CommandContext,
    args: string,
  ) => Promise<SlashCommandActionReturn> | SlashCommandActionReturn;
}

/**
 * Basic VS Code Theme installer.
 * Currently prepares a prompt and defers the heavy work to the model/tools layer.
 */
export const themeInstaller: Installer = {
  name: 'theme',
  // Match any URL to preserve existing behavior; future installers can refine.
  matches: (args: string) => /(https?:\/\/[^\s]+)/.test(args),
  run: (_context: CommandContext, args: string) => {
    const urlMatch = args.match(/(https?:\/\/[^\s]+)/);
    const marketplaceUrl = urlMatch ? urlMatch[1] : '';

    return {
      type: 'submit_prompt',
      content: `I'll help you install a VS Code theme from the marketplace URL you provided: ${marketplaceUrl}

Let me download and extract the theme from this VS Code marketplace extension, then create a custom theme configuration for Gemini CLI.

Please wait while I process this request...`,
    };
  },
};
