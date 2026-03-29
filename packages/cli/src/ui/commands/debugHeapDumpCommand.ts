/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import v8 from 'node:v8';
import path from 'node:path';
import os from 'node:os';
import { MessageType } from '../types.js';
import {
  CommandKind,
  type SlashCommand,
} from './types.js';

export const debugHeapDumpCommand: SlashCommand = {
  name: 'debug-heap-dump',
  description: 'Generate a V8 heap snapshot for memory analysis',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: 'Generating heap snapshot...',
      },
      Date.now(),
    );

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `gemini-cli-heap-${timestamp}.heapsnapshot`;
      const filepath = path.join(os.tmpdir(), filename);
      
      v8.writeHeapSnapshot(filepath);

      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Heap snapshot generated successfully: ${filepath}\n\nTo analyze:\n1. Open Chrome DevTools (any tab).\n2. Go to the "Memory" tab.\n3. Click "Load" and select this file.\n4. Use "Summary" or "Comparison" views to find leaks.`,
        },
        Date.now(),
      );
    } catch (error) {
      context.ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Error generating heap snapshot: ${error instanceof Error ? error.message : String(error)}`,
        },
        Date.now(),
      );
    }
  },
};
