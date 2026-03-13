/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';
import { OutputFormat } from '@google/gemini-cli-core';
import type { CommandContext } from '../commands/types.js';
import type { ExtensionUpdateAction } from '../state/extensions.js';

/**
 * Creates a UI context object with no-op functions.
 * Useful for non-interactive environments where UI operations
 * are not applicable.
 */
export function createNonInteractiveUI(config?: Config): CommandContext['ui'] {
  const outputFormat = config?.getOutputFormat() ?? OutputFormat.TEXT;

  return {
    addItem: (item, _timestamp) => {
      if (
        item.type === 'stats' ||
        item.type === 'model_stats' ||
        item.type === 'tool_stats'
      ) {
        const output =
          outputFormat === OutputFormat.TEXT
            ? JSON.stringify(item, null, 2)
            : JSON.stringify(item);
        process.stdout.write(`${output}\n`);
        return 0;
      }
      if ('text' in item && item.text) {
        if (item.type === 'error') {
          process.stderr.write(`Error: ${item.text}\n`);
        } else if (item.type === 'warning') {
          process.stderr.write(`Warning: ${item.text}\n`);
        } else if (item.type === 'info') {
          process.stdout.write(`${item.text}\n`);
        }
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
