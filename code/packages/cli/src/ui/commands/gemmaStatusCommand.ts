/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { MessageType, type HistoryItemGemmaStatus } from '../types.js';
import { checkGemmaStatus } from '../../commands/gemma/status.js';
import { GEMMA_MODEL_NAME } from '../../commands/gemma/constants.js';

export const gemmaStatusCommand: SlashCommand = {
  name: 'gemma',
  description: 'Check local Gemma model routing status',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  isSafeConcurrent: true,
  action: async (context) => {
    const port =
      parseInt(
        context.services.settings.merged.experimental?.gemmaModelRouter?.classifier?.host?.match(
          /:(\d+)/,
        )?.[1] ?? '',
        10,
      ) || undefined;
    const status = await checkGemmaStatus(port);
    const item: Omit<HistoryItemGemmaStatus, 'id'> = {
      type: MessageType.GEMMA_STATUS,
      binaryInstalled: status.binaryInstalled,
      binaryPath: status.binaryPath,
      modelName: GEMMA_MODEL_NAME,
      modelDownloaded: status.modelDownloaded,
      serverRunning: status.serverRunning,
      serverPid: status.serverPid,
      serverPort: status.port,
      settingsEnabled: status.settingsEnabled,
      allPassing: status.allPassing,
    };
    context.ui.addItem(item);
  },
};
