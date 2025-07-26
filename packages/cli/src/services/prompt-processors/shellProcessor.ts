/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isCommandAllowed,
  ShellExecutionService,
} from '@google/gemini-cli-core';

import { CommandContext } from '../../ui/commands/types.js';
import { IPromptProcessor } from './types.js';

/**
 * Finds all instances of shell command injections (`!{...}`) in a prompt,
 * executes them, and replaces the injection site with the command's output.
 *
 * This processor ensures that only allowlisted commands are executed. If a
 * disallowed command is found, it halts execution and reports an error.
 */
export class ShellProcessor implements IPromptProcessor {
  /**
   * A regular expression to find all instances of `!{...}`. The inner
   * capture group extracts the command itself.
   */
  private static readonly SHELL_INJECTION_REGEX = /!\{([^}]*)\}/g;

  /**
   * @param shellAllowlist A list of shell commands that are explicitly
   *   allowed in the user's config.
   * @param commandName The name of the custom command being executed, used
   *   for logging and error messages.
   */
  constructor(
    private readonly shellAllowlist: string[],
    private readonly commandName: string,
  ) {}

  async process(prompt: string, context: CommandContext): Promise<string> {
    const matches = [...prompt.matchAll(ShellProcessor.SHELL_INJECTION_REGEX)];
    if (matches.length === 0) {
      return prompt;
    }

    let processedPrompt = prompt;

    for (const match of matches) {
      const fullMatch = match[0]; // e.g., "!{git status}"
      const command = match[1].trim(); // e.g., "git status"

      const { config } = context.services;
      const permission = isCommandAllowed(
        command,
        config!,
        this.shellAllowlist,
      );

      if (!permission.allowed) {
        const errorMessage = `Shell command "${command}" in custom command "${this.commandName}" is not allowed. Reason: ${permission.reason}`;
        throw new Error(errorMessage);
      }

      // We have permission, now execute.
      const { result } = ShellExecutionService.execute(
        command,
        config!.getTargetDir(),
        () => {}, // No streaming needed.
        new AbortController().signal, // For now, we don't support cancellation from here.
      );

      const executionResult = await result;
      processedPrompt = processedPrompt.replace(
        fullMatch,
        executionResult.output,
      );
    }

    return processedPrompt;
  }
}
