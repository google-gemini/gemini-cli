/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { listExtensions } from '@google/gemini-cli-core';
import type {
  Command,
  CommandContext,
  CommandExecutionResponse,
} from './types.js';

export class ExtensionsCommand implements Command {
  readonly name = 'extensions';
  readonly description = 'Manage extensions.';
  readonly subCommands = [new ListExtensionsCommand()];
  readonly topLevel = true;

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    return new ListExtensionsCommand().execute(context, _);
  }
}

export class ListExtensionsCommand implements Command {
  readonly name = 'extensions list';
  readonly description = 'Lists all installed extensions.';

  async execute(
    context: CommandContext,
    _: string[],
  ): Promise<CommandExecutionResponse> {
    const extensions = listExtensions(context.config);
    const data = extensions.length ? extensions : 'No extensions installed.';

    return { name: this.name, data };
  }
}
