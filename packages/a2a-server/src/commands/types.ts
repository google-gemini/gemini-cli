/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ExecutionEventBus, AgentExecutor } from '@a2a-js/sdk/server';
import type { Config, GitService } from '@google/gemini-cli-core';

export interface CommandContext {
  config: Config;
  git?: GitService;
  agentExecutor?: AgentExecutor;
  eventBus?: ExecutionEventBus;
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
  readonly requiresWorkspace?: boolean;
  readonly streaming?: boolean;

  execute(
    config: CommandContext,
    args: string[],
  ): Promise<CommandExecutionResponse>;
}

export interface CommandExecutionResponse {
  readonly name: string;
  readonly data: unknown;
}
