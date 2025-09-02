/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HistoryItemCompression, MessageType } from '../types.js';
import { CommandKind, SlashCommand } from './types.js';
import i18n, { t } from '../../i18n/index.js';

export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['summarize'],
  description: t('commands:descriptions.compress'),
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const { ui } = context;
    if (ui.pendingItem) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: i18n.t('compress.alreadyInProgress', { ns: 'commands' }),
        },
        Date.now(),
      );
      return;
    }

    const pendingMessage: HistoryItemCompression = {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        originalTokenCount: null,
        newTokenCount: null,
      },
    };

    try {
      ui.setPendingItem(pendingMessage);
      const promptId = `compress-${Date.now()}`;
      const compressed = await context.services.config
        ?.getGeminiClient()
        ?.tryCompressChat(promptId, true);
      if (compressed) {
        ui.addItem(
          {
            type: MessageType.COMPRESSION,
            compression: {
              isPending: false,
              originalTokenCount: compressed.originalTokenCount,
              newTokenCount: compressed.newTokenCount,
            },
          } as HistoryItemCompression,
          Date.now(),
        );
      } else {
        ui.addItem(
          {
            type: MessageType.ERROR,
            text: i18n.t('compress.failed', { ns: 'commands' }),
          },
          Date.now(),
        );
      }
    } catch (e) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: i18n.t('compress.failedWithError', {
            error: e instanceof Error ? e.message : String(e),
            ns: 'commands'
          }),
        },
        Date.now(),
      );
    } finally {
      ui.setPendingItem(null);
    }
  },
};
