/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { appendToLastTextPart } from '@google/gemini-cli-core';
import type { IPromptProcessor, PromptPipelineContent } from './types.js';
import type { CommandContext } from '../../ui/commands/types.js';

/**
 * Appends the user's full command invocation to the prompt if arguments are
 * provided, allowing the model to perform its own argument parsing.
 *
 * This processor is only used if the prompt does NOT contain {{args}}.
 */
export class DefaultArgumentProcessor implements IPromptProcessor {
  async process(
    prompt: PromptPipelineContent,
    context: CommandContext,
  ): Promise<PromptPipelineContent> {
    if (context.invocation?.args) {
      return appendToLastTextPart(prompt, context.invocation.raw);
    }
    return prompt;
  }
}
