/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { IPromptProcessor, SHORTHAND_ARGS_PLACEHOLDER } from './types.js';

/**
 * Replaces all instances of `{{args}}` in a prompt with the user-provided
 * argument string.
 */
export class ShorthandArgumentProcessor implements IPromptProcessor {
  async process(
    prompt: string,
    args: string,
    _fullCommand: string,
  ): Promise<string> {
    return prompt.replaceAll(SHORTHAND_ARGS_PLACEHOLDER, args);
  }
}

/**
 * Appends the user's full command invocation to the prompt if arguments are
 * provided, allowing the model to perform its own argument parsing.
 */
export class DefaultArgumentProcessor implements IPromptProcessor {
  async process(
    prompt: string,
    args: string,
    fullCommand: string,
  ): Promise<string> {
    if (args) {
      return `${prompt}\n\n${fullCommand}`;
    }
    return prompt;
  }
}
