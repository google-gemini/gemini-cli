/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageType, type HistoryItemCompression } from '../types.js';
import { CommandKind, type SlashCommand } from './types.js';

let activeAbortController: AbortController | null = null;

export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['summarize', 'compact'],
  description: 'Compresses the context by replacing it with a summary',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const { ui } = context;
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
        originalTokenCount: null,
        newTokenCount: null,
        compressionStatus: null,
      },
    };

    ui.setPendingItem(pendingMessage);

    // Create an AbortController so the compression can be cancelled
    // (e.g. when the user starts a new prompt or presses Escape).
    const abortController = new AbortController();
    activeAbortController = abortController;
    const signal = abortController.signal;

    void (async () => {
      try {
        const promptId = `compress-${Date.now()}`;
        const compressed =
          await context.services.agentContext?.geminiClient?.tryCompressChat(
            promptId,
            true,
            signal,
          );

        // If cancelled while the network request was in flight, bail out
        // silently — the UI is no longer waiting for this result.
        if (signal.aborted) {
          return;
        }

        if (compressed) {
          ui.addItem(
            {
              type: MessageType.COMPRESSION,
              compression: {
                isPending: false,
                originalTokenCount: compressed.originalTokenCount,
                newTokenCount: compressed.newTokenCount,
                compressionStatus: compressed.compressionStatus,
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
        // Swallow abort errors — they are expected when the user cancels.
        if (signal.aborted) {
          return;
        }
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
        if (activeAbortController === abortController) {
          activeAbortController = null;
        }
        ui.setPendingItem(null);
      }
    })();
  },
};

/**
 * Aborts any in-flight compression started by the `/compress` command.
 * Call this when the user cancels a turn or starts a new prompt.
 */
export function abortActiveCompression(): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
}
