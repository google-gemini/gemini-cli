/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType, type HistoryItemCompression } from '../types.js';
import { CommandKind, type SlashCommand } from './types.js';
import { tokenLimit, type CompressionStatus } from '@google/gemini-cli-core';

export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['summarize', 'compact'],
  description: 'Compresses the context by replacing it with a summary',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const { ui, services } = context;
    const agentContext = services.agentContext;
    if (!agentContext) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Agent context not found.',
        },
        Date.now(),
      );
      return;
    }

    const config = agentContext.config;

    if (ui.pendingItem) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Already compressing, wait for previous request to complete',
        },
        Date.now(),
      );
      return;
    }

    const pendingMessage: HistoryItemCompression = {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        beforePercentage: null,
        afterPercentage: null,
        compressionStatus: null,
        isManual: true,
      },
    };

    try {
      ui.setPendingItem(pendingMessage);
      const promptId = `compress-${Date.now()}`;
      const compressed = await agentContext.geminiClient.tryCompressChat(
        promptId,
        true,
      );
      if (compressed) {
        const limit = tokenLimit(config.getModel());
        const threshold = config.getContextWindowCompressionThreshold();
        const beforePercentage = Math.round(
          (compressed.originalTokenCount / limit) * 100,
        );
        const afterPercentage = Math.round(
          (compressed.newTokenCount / limit) * 100,
        );

        ui.addItem(
          {
            type: MessageType.COMPRESSION,
            compression: {
              isPending: false,
              beforePercentage,
              afterPercentage,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
              compressionStatus:
                Number(compressed.compressionStatus) as unknown as CompressionStatus,
              isManual: true,
              thresholdPercentage: Math.round(threshold * 100),
            },
          } as HistoryItemCompression,
          Date.now(),
        );
      } else {
        ui.addItem(
          {
            type: MessageType.ERROR,
            text: 'Failed to compress chat history.',
          },
          Date.now(),
        );
      }
    } catch (e) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to compress chat history: ${
            e instanceof Error ? e.message : String(e)
          }`,
        },
        Date.now(),
      );
    } finally {
      ui.setPendingItem(null);
    }
  },
};
