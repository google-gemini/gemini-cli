/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { MessageType } from '../types.js';
import {
  CommandKind,
  type SlashCommand,
} from './types.js';
import { formatBytes } from '../utils/formatters.js';

export const debugMemoryInfoCommand: SlashCommand = {
  name: 'debug-memory-info',
  description: 'Show detailed process memory information',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const usage = process.memoryUsage();
    
    const lines = [
      `RSS: ${formatBytes(usage.rss)} (Total memory allocated for the process)`,
      `Heap Total: ${formatBytes(usage.heapTotal)} (V8 heap total size)`,
      `Heap Used: ${formatBytes(usage.heapUsed)} (V8 heap actually used)`,
      `External: ${formatBytes(usage.external)} (C++ objects bound to JS objects)`,
      `Array Buffers: ${formatBytes(usage.arrayBuffers)} (Memory for ArrayBuffer and SharedArrayBuffer)`,
    ];

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: `Detailed Memory Info:\n${lines.map(l => `  • ${l}`).join('\n')}`,
      },
      Date.now(),
    );
  },
};
