/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { cronSchedulerService } from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

export const loopCommand: SlashCommand = {
  name: 'loop',
  kind: CommandKind.BUILT_IN,
  description: 'Schedules a repeating prompt (e.g., /loop 5m check the build)',
  autoExecute: true,
  action: async (context) => {
    const args = context.invocation?.args?.trim() || '';
    if (!args) {
      context.ui.addItem({
        type: MessageType.INFO,
        text: 'Please provide a prompt to loop. Example: /loop 5m check the build',
      });
      return;
    }

    // Default to 10 minutes if no interval is provided
    let intervalString = '10m';

    // Check if the first word is an interval
    const match = args.match(/^(\d+[smhd])\s+(.*)/i);
    let prompt = args;

    if (match) {
      intervalString = match[1].toLowerCase();
      prompt = match[2].trim();
    }

    try {
      const id = cronSchedulerService.scheduleTask(
        intervalString,
        prompt,
        true,
      );
      context.ui.addItem({
        type: MessageType.INFO,
        text: `Scheduled recurring task \`${id}\` to run \`${prompt}\` every ${intervalString}.`,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      context.ui.addItem({
        type: MessageType.INFO,
        text: `Failed to schedule task: ${message}`,
      });
    }
  },
};
