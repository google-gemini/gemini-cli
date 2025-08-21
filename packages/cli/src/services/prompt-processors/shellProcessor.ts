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
} from '@google/gemini-cli-core';

import { CommandContext } from '../../ui/commands/types.js';
import {
  IPromptProcessor,
  SHELL_INJECTION_TRIGGER,
  SHORTHAND_ARGS_PLACEHOLDER,
} from './types.js';

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
 * Represents a single detected shell injection site in the prompt.
 */
interface ShellInjection {
  /** The shell command extracted from within !{...}, trimmed. */
  command: string;
  /** The starting index of the injection (inclusive, points to '!'). */
  startIndex: number;
  /** The ending index of the injection (exclusive, points after '}'). */
  endIndex: number;
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

  async process(prompt: string, context: CommandContext): Promise<string> {
    const userArgsRaw = context.invocation?.args || '';

    if (!prompt.includes(SHELL_INJECTION_TRIGGER)) {
      return prompt.replaceAll(SHORTHAND_ARGS_PLACEHOLDER, userArgsRaw);
    }

    const config = context.services.config;
    if (!config) {
      throw new Error(
        `Security configuration not loaded. Cannot verify shell command permissions for '${this.commandName}'. Aborting.`,
      );
    }
    const { sessionShellAllowlist } = context.session;

    const injections = this.extractInjections(prompt);
    // If extractInjections found no closed blocks (and didn't throw), treat as raw.
    if (injections.length === 0) {
      return prompt.replaceAll(SHORTHAND_ARGS_PLACEHOLDER, userArgsRaw);
    }

    const { shell } = getShellConfiguration();
    const userArgsEscaped = escapeShellArg(userArgsRaw, shell);

    const resolvedInjections = injections.map((injection) => {
      if (injection.command === '') {
        return injection;
      }
      // Replace {{args}} inside the command string with the escaped version.
      const resolvedCommand = injection.command.replaceAll(
        SHORTHAND_ARGS_PLACEHOLDER,
        userArgsEscaped,
      );
      return { ...injection, resolvedCommand };
    });

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

    return processedPrompt;
  }

  /**
   * Iteratively parses the prompt string to extract shell injections (!{...}),
   * correctly handling nested braces within the command.
   *
   * @param prompt The prompt string to parse.
   * @returns An array of extracted ShellInjection objects.
   * @throws Error if an unclosed injection (`!{`) is found.
   */
  private extractInjections(prompt: string): ShellInjection[] {
    const injections: ShellInjection[] = [];
    let index = 0;

    while (index < prompt.length) {
      const startIndex = prompt.indexOf(SHELL_INJECTION_TRIGGER, index);

      if (startIndex === -1) {
        break;
      }

      let currentIndex = startIndex + SHELL_INJECTION_TRIGGER.length;
      let braceCount = 1;
      let foundEnd = false;

      while (currentIndex < prompt.length) {
        const char = prompt[currentIndex];

        // We count literal braces. This parser does not interpret shell quoting/escaping.
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            const commandContent = prompt.substring(
              startIndex + SHELL_INJECTION_TRIGGER.length,
              currentIndex,
            );
            const endIndex = currentIndex + 1;

            injections.push({
              command: commandContent.trim(),
              startIndex,
              endIndex,
            });

            index = endIndex;
            foundEnd = true;
            break;
          }
        }
        currentIndex++;
      }

      // Check if the inner loop finished without finding the closing brace.
      if (!foundEnd) {
        throw new Error(
          `Invalid syntax in command '${this.commandName}': Unclosed shell injection starting at index ${startIndex} ('!{'). Ensure braces are balanced.`,
        );
      }
    }

    return injections;
  }
}
