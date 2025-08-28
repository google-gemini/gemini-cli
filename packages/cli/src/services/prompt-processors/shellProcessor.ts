/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApprovalMode,
  checkCommandPermissions,
  escapeShellArg,
  getShellConfiguration,
  ShellExecutionService,
  flatMapTextParts,
} from '@google/gemini-cli-core';

import type { CommandContext } from '../../ui/commands/types.js';
import type { IPromptProcessor, PromptPipelineContent } from './types.js';
import {
  SHELL_INJECTION_TRIGGER,
  SHORTHAND_ARGS_PLACEHOLDER,
} from './types.js';
import { extractInjections, type Injection } from './injectionParser.js';

export class ConfirmationRequiredError extends Error {
  constructor(
    message: string,
    public commandsToConfirm: string[],
  ) {
    super(message);
    this.name = 'ConfirmationRequiredError';
  }
}

/**
 * Represents a single detected shell injection site in the prompt,
 * after resolution of arguments. Extends the base Injection interface.
 */
interface ResolvedShellInjection extends Injection {
  /** The command after {{args}} has been escaped and substituted. */
  resolvedCommand?: string;
}

/**
 * Handles prompt interpolation, including shell command execution (`!{...}`)
 * and context-aware argument injection (`{{args}}`).
 *
 * This processor ensures that:
 * 1. `{{args}}` outside `!{...}` are replaced with raw input.
 * 2. `{{args}}` inside `!{...}` are replaced with shell-escaped input.
 * 3. Shell commands are executed securely after argument substitution.
 * 4. Parsing correctly handles nested braces.
 */
export class ShellProcessor implements IPromptProcessor {
  constructor(private readonly commandName: string) {}

  async process(
    prompt: PromptPipelineContent,
    context: CommandContext,
  ): Promise<PromptPipelineContent> {
    return flatMapTextParts(prompt, (text) =>
      this.processString(text, context),
    );
  }

  private async processString(
    prompt: string,
    context: CommandContext,
  ): Promise<PromptPipelineContent> {
    const userArgsRaw = context.invocation?.args || '';

    if (!prompt.includes(SHELL_INJECTION_TRIGGER)) {
      return [
        { text: prompt.replaceAll(SHORTHAND_ARGS_PLACEHOLDER, userArgsRaw) },
      ];
    }

    const config = context.services.config;
    if (!config) {
      throw new Error(
        `Security configuration not loaded. Cannot verify shell command permissions for '${this.commandName}'. Aborting.`,
      );
    }
    const { sessionShellAllowlist } = context.session;

    const injections = extractInjections(
      prompt,
      SHELL_INJECTION_TRIGGER,
      this.commandName,
    );

    // If extractInjections found no closed blocks (and didn't throw), treat as raw.
    if (injections.length === 0) {
      return [
        { text: prompt.replaceAll(SHORTHAND_ARGS_PLACEHOLDER, userArgsRaw) },
      ];
    }

    const { shell } = getShellConfiguration();
    const userArgsEscaped = escapeShellArg(userArgsRaw, shell);

    const resolvedInjections: ResolvedShellInjection[] = injections.map(
      (injection) => {
        const command = injection.content;

        if (command === '') {
          return { ...injection, resolvedCommand: undefined };
        }

        const resolvedCommand = command.replaceAll(
          SHORTHAND_ARGS_PLACEHOLDER,
          userArgsEscaped,
        );
        return { ...injection, resolvedCommand };
      },
    );

    const commandsToConfirm = new Set<string>();
    for (const injection of resolvedInjections) {
      const command = injection.resolvedCommand;

      if (!command) continue;

      // Security check on the final, escaped command string.
      const { allAllowed, disallowedCommands, blockReason, isHardDenial } =
        checkCommandPermissions(command, config, sessionShellAllowlist);

      if (!allAllowed) {
        if (isHardDenial) {
          throw new Error(
            `${this.commandName} cannot be run. Blocked command: "${command}". Reason: ${blockReason || 'Blocked by configuration.'}`,
          );
        }

        // If not a hard denial, respect YOLO mode and auto-approve.
        if (config.getApprovalMode() !== ApprovalMode.YOLO) {
          disallowedCommands.forEach((uc) => commandsToConfirm.add(uc));
        }
      }
    }

    // Handle confirmation requirements.
    if (commandsToConfirm.size > 0) {
      throw new ConfirmationRequiredError(
        'Shell command confirmation required',
        Array.from(commandsToConfirm),
      );
    }

    let processedPrompt = '';
    let lastIndex = 0;

    for (const injection of resolvedInjections) {
      // Append the text segment BEFORE the injection, substituting {{args}} with RAW input.
      const segment = prompt.substring(lastIndex, injection.startIndex);
      processedPrompt += segment.replaceAll(
        SHORTHAND_ARGS_PLACEHOLDER,
        userArgsRaw,
      );

      // Execute the resolved command (which already has ESCAPED input).
      if (injection.resolvedCommand) {
        const { result } = await ShellExecutionService.execute(
          injection.resolvedCommand,
          config.getTargetDir(),
          () => {},
          new AbortController().signal,
          config.getShouldUseNodePtyShell(),
        );

        const executionResult = await result;

        // Handle Spawn Errors
        if (executionResult.error && !executionResult.aborted) {
          throw new Error(
            `Failed to start shell command in '${this.commandName}': ${executionResult.error.message}. Command: ${injection.resolvedCommand}`,
          );
        }

        // Append the output, making stderr explicit for the model.
        processedPrompt += executionResult.output;

        // Append a status message if the command did not succeed.
        if (executionResult.aborted) {
          processedPrompt += `\n[Shell command '${injection.resolvedCommand}' aborted]`;
        } else if (
          executionResult.exitCode !== 0 &&
          executionResult.exitCode !== null
        ) {
          processedPrompt += `\n[Shell command '${injection.resolvedCommand}' exited with code ${executionResult.exitCode}]`;
        } else if (executionResult.signal !== null) {
          processedPrompt += `\n[Shell command '${injection.resolvedCommand}' terminated by signal ${executionResult.signal}]`;
        }
      }

      lastIndex = injection.endIndex;
    }

    // Append the remaining text AFTER the last injection, substituting {{args}} with RAW input.
    const finalSegment = prompt.substring(lastIndex);
    processedPrompt += finalSegment.replaceAll(
      SHORTHAND_ARGS_PLACEHOLDER,
      userArgsRaw,
    );

    return [{ text: processedPrompt }];
  }
}
