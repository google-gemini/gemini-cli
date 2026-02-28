/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config, GitService } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../../config/settings.js';

export interface CommandContext {
  config: Config;
  settings: LoadedSettings;
  git?: GitService;
  sendMessage: (text: string) => Promise<void>;
}

export interface CommandArgument {
  readonly name: string;
  readonly description: string;
  readonly isRequired?: boolean;
}

export interface Command {
  readonly name: string;
  readonly aliases?: string[];
  readonly description: string;
  readonly arguments?: CommandArgument[];
  readonly subCommands?: Command[];
  readonly requiresWorkspace?: boolean;

  execute(
    context: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse>;
}

export interface CommandExecutionResponse {
  readonly name: string;
  readonly data: unknown;
}
