/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '@google/gemini-cli-core';

enum CommandAction {
  SUBMIT_PROMPT = 'submitPrompt',
}

export interface CommandArgument {
  readonly name: string;
  readonly description: string;
  readonly isRequired?: boolean;
}

export interface Command {
  readonly name: string;
  readonly description: string;
  readonly arguments?: CommandArgument[];
  readonly subCommands?: Command[];
  readonly topLevel?: boolean;

  execute(config: Config, args: string[]): Promise<CommandExecutionResponse>;
}

export interface CommandExecutionResponse {
  readonly name: string;
  readonly data: unknown;
  readonly action?: CommandAction;
}
