/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import open from 'open';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { MessageType } from '../types.js';
import {
  isInsideSandboxEnvironment,
  isMacOsSeatbeltSandbox,
} from '@google/gemini-cli-core';

export const docsCommand: SlashCommand = {
  name: 'docs',
  description: 'Open full Gemini CLI documentation in your browser',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext): Promise<void> => {
    const docsUrl = 'https://goo.gle/gemini-cli-docs';

    if (isInsideSandboxEnvironment() && !isMacOsSeatbeltSandbox()) {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Please open the following URL in your browser to view the documentation:\n${docsUrl}`,
        },
        Date.now(),
      );
    } else {
      context.ui.addItem(
        {
          type: MessageType.INFO,
          text: `Opening documentation in your browser: ${docsUrl}`,
        },
        Date.now(),
      );
      await open(docsUrl);
    }
  },
};
