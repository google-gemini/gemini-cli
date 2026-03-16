/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import { ApprovalMode } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

export const yoloCommand: SlashCommand = {
  name: 'yolo',
  description:
    'Enable YOLO mode — auto-approve all tool calls, no permission prompts',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context: CommandContext) => {
    const config = context.services.config;
    if (!config) {
      context.ui.addItem({
        type: MessageType.ERROR,
        text: 'Config not available',
      });
      return;
    }

    try {
      config.setApprovalMode(ApprovalMode.YOLO);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      context.ui.addItem({
        type: MessageType.ERROR,
        text: errorMessage,
      });
      return;
    }

    context.ui.addItem({
      type: MessageType.INFO,
      text: 'YOLO mode enabled — all tool calls auto-approved',
    });
  },
};
