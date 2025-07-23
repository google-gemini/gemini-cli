/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { IPromptProcessor } from './types.js';

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
    return prompt.replaceAll('{{args}}', args);
  }
}

/**
 * Prepends the user's full command invocation to the prompt, separated by a
 * Markdown horizontal rule. This provides a clean, structured context for
 * the model to perform its own argument parsing based on the user's instructions.
 */
export class ModelLedArgumentProcessor implements IPromptProcessor {
  async process(
    prompt: string,
    _args: string,
    fullCommand: string,
  ): Promise<string> {
    return `${fullCommand}\n\n---\n\n${prompt}`;
  }
}
