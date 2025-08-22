/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readPathFromWorkspace } from '@google/gemini-cli-core';
import { CommandContext } from '../../ui/commands/types.js';
import { MessageType } from '../../ui/types.js';
import { AT_FILE_INJECTION_TRIGGER, IPromptProcessor } from './types.js';

/**
 * Represents a single detected file injection site in the prompt.
 */
interface FileInjection {
  /** The file path extracted from within @{...}, trimmed. */
  path: string;
  /** The starting index of the injection (inclusive, points to '@'). */
  startIndex: number;
  /** The ending index of the injection (exclusive, points after '}'). */
  endIndex: number;
}

export class AtFileProcessor implements IPromptProcessor {
  async process(prompt: string, context: CommandContext): Promise<string> {
    if (!prompt.includes(AT_FILE_INJECTION_TRIGGER)) {
      return prompt;
    }

    if (!context.services.config) {
      // If there's no config, we can't resolve workspace paths,
      // so return the prompt unmodified.
      return prompt;
    }

    const injections = this.extractInjections(prompt);
    if (injections.length === 0) {
      return prompt;
    }

    let processedPrompt = '';
    let lastIndex = 0;

    for (const injection of injections) {
      // Append the text segment BEFORE the injection.
      processedPrompt += prompt.substring(lastIndex, injection.startIndex);

      try {
        const workspace = context.services.config.getWorkspaceContext();
        const fileContent = await readPathFromWorkspace(
          injection.path,
          workspace,
        );
        processedPrompt += fileContent;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const uiMessage = `Failed to inject file content for '@{${injection.path}}': ${message}`;

        // Log to console for debugging.
        console.error(
          `[AtFileProcessor] ${uiMessage}. Leaving placeholder in prompt.`,
        );

        // Add item to the UI for user feedback.
        context.ui.addItem(
          {
            type: MessageType.ERROR,
            text: uiMessage,
          },
          Date.now(),
        );

        // If the file can't be read, leave the original placeholder in the prompt.
        processedPrompt += prompt.substring(
          injection.startIndex,
          injection.endIndex,
        );
      }

      lastIndex = injection.endIndex;
    }

    // Append the remaining text AFTER the last injection.
    processedPrompt += prompt.substring(lastIndex);

    return processedPrompt;
  }

  /**
   * Iteratively parses the prompt string to extract file injections (@{...}),
   * correctly handling nested braces within the path.
   *
   * @param prompt The prompt string to parse.
   * @returns An array of extracted FileInjection objects.
   */
  private extractInjections(prompt: string): FileInjection[] {
    const injections: FileInjection[] = [];
    let index = 0;

    while (index < prompt.length) {
      const startIndex = prompt.indexOf(AT_FILE_INJECTION_TRIGGER, index);

      if (startIndex === -1) {
        break;
      }

      let currentIndex = startIndex + AT_FILE_INJECTION_TRIGGER.length;
      let braceCount = 1;
      let foundEnd = false;

      while (currentIndex < prompt.length) {
        const char = prompt[currentIndex];

        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            const pathContent = prompt.substring(
              startIndex + AT_FILE_INJECTION_TRIGGER.length,
              currentIndex,
            );
            const endIndex = currentIndex + 1;

            injections.push({
              path: pathContent.trim(),
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

      // If the inner loop finished without finding the closing brace,
      // it's not a valid injection, so we just advance the index and continue.
      if (!foundEnd) {
        index = startIndex + 1;
      }
    }

    return injections;
  }
}
