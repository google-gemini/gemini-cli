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
export function createNonInteractiveUI(
  config: Config,
  stdout: { write: (text: string) => void } = process.stdout,
): CommandContext['ui'] {
  return {
    addItem: (item, _timestamp) => {
      if (config.getOutputFormat() === OutputFormat.JSON) {
        if (
          item.type === 'stats' ||
          item.type === 'model_stats' ||
          item.type === 'tool_stats'
        ) {
          stdout.write(JSON.stringify(item, null, 2) + '\n');
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
    removeComponent: () => {},
  };
}
