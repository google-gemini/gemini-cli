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
 * VS Code Theme installer that validates input before proceeding to AI.
 */
export const themeInstaller: Installer = {
  name: 'theme',
  // Match any URL to preserve existing behavior; future installers can refine.
  matches: (args: string) => /(https?:\/\/[^\s]+)/.test(args),
  run: (_context: CommandContext, args: string) => {
    const urlMatch = args.match(/(https?:\/\/[^\s]+)/);
    const marketplaceUrl = urlMatch ? urlMatch[1] : '';

    // Validate that it's a VS Code marketplace URL
    if (!marketplaceUrl.includes('marketplace.visualstudio.com')) {
      return {
        type: 'submit_prompt',
        content: `The URL you provided doesn't appear to be a valid VS Code marketplace URL: ${marketplaceUrl}

Please provide a valid VS Code marketplace URL in the format:
https://marketplace.visualstudio.com/items?itemName=publisher.extension-name

Example: https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code`,
      };
    }

    // Validate that it has the itemName parameter
    if (!marketplaceUrl.includes('itemName=')) {
      return {
        type: 'submit_prompt',
        content: `The marketplace URL is missing the itemName parameter: ${marketplaceUrl}

Please provide a complete VS Code marketplace URL that includes the itemName parameter.

Example: https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code`,
      };
    }

    // Extract the itemName to validate format
    const itemNameMatch = marketplaceUrl.match(/itemName=([^&]+)/);
    if (!itemNameMatch) {
      return {
        type: 'submit_prompt',
        content: `Could not extract the extension name from the URL: ${marketplaceUrl}

Please ensure the URL follows the correct format:
https://marketplace.visualstudio.com/items?itemName=publisher.extension-name`,
      };
    }

    const itemName = itemNameMatch[1];
    const parts = itemName.split('.');
    if (parts.length < 2) {
      return {
        type: 'submit_prompt',
        content: `The extension name "${itemName}" doesn't follow the expected format (publisher.extension-name).

Please provide a valid VS Code marketplace URL with a properly formatted extension name.

Example: https://marketplace.visualstudio.com/items?itemName=arcticicestudio.nord-visual-studio-code`,
      };
    }

    // If all validations pass, proceed with the installation
    return {
      type: 'submit_prompt',
      content: `I'll help you install a VS Code theme from the marketplace URL you provided: ${marketplaceUrl}

Let me download and extract the theme from this VS Code marketplace extension, then create a custom theme configuration for Gemini CLI.

Please wait while I process this request...`,
    };
  },
};
