/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { debugLogger } from '@google/gemini-cli-core';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';
import { formatBytes } from '../utils/formatters.js';
import { captureHeapSnapshot } from '../utils/memorySnapshot.js';

export const bugMemoryCommand: SlashCommand = {
  name: 'bug-memory',
  description: 'Capture a V8 heap snapshot to disk to attach to a bug report',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext): Promise<void> => {
    const tempDir =
      context.services.agentContext?.config?.storage?.getProjectTempDir();
    if (!tempDir) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Cannot capture heap snapshot: project temp directory is unavailable.',
        },
        Date.now(),
      );
      return;
    }

    const filePath = path.join(
      tempDir,
      `bug-memory-${Date.now()}.heapsnapshot`,
    );
    const rss = process.memoryUsage().rss;

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Capturing V8 heap snapshot (current RSS: ${formatBytes(rss)}).\nThis can take 20+ seconds and the CLI may be temporarily unresponsive — please do not exit.\nDestination: ${filePath}`,
      },
      Date.now(),
    );

    const startedAt = Date.now();
    try {
      await captureHeapSnapshot(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLogger.error(`Failed to capture heap snapshot: ${message}`);
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to capture heap snapshot: ${message}`,
        },
        Date.now(),
      );
      return;
    }

    const durationMs = Date.now() - startedAt;
    let sizeText = '';
    try {
      const { size } = await stat(filePath);
      sizeText = ` (${formatBytes(size)})`;
    } catch {
      // Size reporting is best-effort; the snapshot itself was captured successfully.
    }

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Heap snapshot saved${sizeText} in ${durationMs}ms:\n${filePath}\n\nLoad it in Chrome DevTools → Memory → "Load" to analyze. Attach it to your bug report only if it does not contain sensitive information.`,
      },
      Date.now(),
    );
  },
};
