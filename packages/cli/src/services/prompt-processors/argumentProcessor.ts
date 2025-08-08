/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { IPromptProcessor } from './types.js';
import { CommandContext } from '../../ui/commands/types.js';

/**
 * Appends the user's full command invocation to the prompt if arguments are
 * provided, allowing the model to perform its own argument parsing.
 *
 * This processor is only used if the prompt does NOT contain {{args}}.
 */
export class DefaultArgumentProcessor implements IPromptProcessor {
  async process(prompt: string, context: CommandContext): Promise<string> {
    if (context.invocation!.args) {
      return `${prompt}\n\n${context.invocation!.raw}`;
    }
    return prompt;
  }
}
