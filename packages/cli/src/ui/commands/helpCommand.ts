/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType, type HistoryItemHelp } from '../types.js';
import { getAntigravityCompatibility } from '../utils/antigravityUtils.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  kind: CommandKind.BUILT_IN,
  description: 'For help on gemini-cli',
  autoExecute: true,
  action: async (context, args) => {
    const lowerArgs = args?.toLowerCase() || '';
    const hasAntigravity = lowerArgs.includes('antigravity');
    const hasInstallOrMigrate =
      lowerArgs.includes('install') || lowerArgs.includes('migrate');
    const hasCompatibility =
      lowerArgs.includes('compat') || lowerArgs.includes('cpu');

    if (hasAntigravity && (hasInstallOrMigrate || hasCompatibility)) {
      const compat = getAntigravityCompatibility();

      if (!compat.cpuCompatible) {
        // Show hardware incompatibility warning instead of install instructions
        context.ui.addItem({
          type: MessageType.INFO,
          text:
            `⚠ Hardware Compatibility Issue:\n\n${compat.incompatibilityReason}\n\n` +
            `You can continue using Gemini CLI (Node.js) on this machine. ` +
            `See https://github.com/google-gemini/gemini-cli/issues/27342 for updates.`,
        });
        return;
      }

      if (compat.installInfo) {
        context.ui.addItem({
          type: MessageType.INFO,
          text: `To install the Antigravity CLI on ${compat.installInfo.platformName}, run the following command:\n\n'${compat.installInfo.installCmd}'`,
        });
      } else {
        context.ui.addItem({
          type: MessageType.INFO,
          text: `Learn more about Antigravity CLI at https://antigravity.google/docs/cli-getting-started`,
        });
      }
      return;
    }

    const helpItem: Omit<HistoryItemHelp, 'id'> = {
      type: MessageType.HELP,
      timestamp: new Date(),
    };

    context.ui.addItem(helpItem);
  },
};
