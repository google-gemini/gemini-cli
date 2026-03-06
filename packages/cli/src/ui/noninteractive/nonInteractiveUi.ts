/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext } from '../commands/types.js';
import type { ExtensionUpdateAction } from '../state/extensions.js';
import type { HistoryItemAbout, HistoryItemWithoutId } from '../types.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { getDisplayString } from '@google/gemini-cli-core';

/**
 * Type guard to check if an item is a HistoryItemAbout
 */
function isHistoryItemAbout(
  item: HistoryItemWithoutId,
): item is HistoryItemAbout {
  return item.type === 'about';
}

/**
 * Creates a UI context object with no-op functions.
 * Useful for non-interactive environments where UI operations
 * are not applicable.
 */
export function createNonInteractiveUI(): CommandContext['ui'] {
  return {
    addItem: (item, _timestamp) => {
      if ('text' in item && item.text) {
        if (item.type === 'error') {
          process.stderr.write(`Error: ${item.text}\n`);
        } else if (item.type === 'warning') {
          process.stderr.write(`Warning: ${item.text}\n`);
        } else if (item.type === 'info') {
          process.stdout.write(`${item.text}\n`);
        }
      } else if (isHistoryItemAbout(item)) {
        // Format ABOUT items for console output
        const aboutItem = item;
        const lines: string[] = [];
        lines.push('About Gemini CLI');
        lines.push('');
        lines.push(
          `CLI Version${' '.repeat(60 - 'CLI Version'.length)}${aboutItem.cliVersion}`,
        );
        if (GIT_COMMIT_INFO && !['N/A'].includes(GIT_COMMIT_INFO)) {
          lines.push(
            `Git Commit${' '.repeat(60 - 'Git Commit'.length)}${GIT_COMMIT_INFO}`,
          );
        }
        lines.push(
          `Model${' '.repeat(60 - 'Model'.length)}${getDisplayString(aboutItem.modelVersion)}`,
        );
        lines.push(
          `Sandbox${' '.repeat(60 - 'Sandbox'.length)}${aboutItem.sandboxEnv}`,
        );
        lines.push(`OS${' '.repeat(60 - 'OS'.length)}${aboutItem.osVersion}`);
        if (aboutItem.selectedAuthType) {
          const authDisplay =
            aboutItem.selectedAuthType.startsWith('oauth') &&
            aboutItem.userEmail
              ? `Logged in with Google (${aboutItem.userEmail})`
              : aboutItem.selectedAuthType;
          lines.push(
            `Auth Method${' '.repeat(60 - 'Auth Method'.length)}${authDisplay}`,
          );
        }
        if (aboutItem.tier) {
          lines.push(`Tier${' '.repeat(60 - 'Tier'.length)}${aboutItem.tier}`);
        }
        if (aboutItem.gcpProject) {
          lines.push(
            `GCP Project${' '.repeat(60 - 'GCP Project'.length)}${aboutItem.gcpProject}`,
          );
        }
        if (aboutItem.ideClient) {
          lines.push(
            `IDE Client${' '.repeat(60 - 'IDE Client'.length)}${aboutItem.ideClient}`,
          );
        }
        process.stdout.write(lines.join('\n') + '\n');
      }
      return 0;
    },
    clear: () => {},
    setDebugMessage: (_message) => {},
    loadHistory: (_newHistory) => {},
    pendingItem: null,
    setPendingItem: (_item) => {},
    toggleCorgiMode: () => {},
    toggleDebugProfiler: () => {},
    toggleVimEnabled: async () => false,
    reloadCommands: () => {},
    openAgentConfigDialog: () => {},
    extensionsUpdateState: new Map(),
    dispatchExtensionStateUpdate: (_action: ExtensionUpdateAction) => {},
    addConfirmUpdateExtensionRequest: (_request) => {},
    setConfirmationRequest: (_request) => {},
    removeComponent: () => {},
    toggleBackgroundShell: () => {},
    toggleShortcutsHelp: () => {},
  };
}
