/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { restore } from '@google/gemini-cli-core';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';

export class RestoreCommand implements Command {
  readonly name = 'restore';
  readonly description =
    'Restore a previous tool call, or list available tool calls to restore.';
  readonly topLevel = true;

  async execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse> {
    const data = await restore(context.config, context.git, args.join(' '));
    return { name: this.name, data };
  }
}
