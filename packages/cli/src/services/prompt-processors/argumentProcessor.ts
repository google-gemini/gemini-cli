/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
      if (prompt.length === 0) {
        return [
          {
            text: `

${context.invocation.raw}`,
          },
        ];
      }

      const lastPart = prompt[prompt.length - 1];
      const newPrompt = [...prompt]; // Create a mutable copy

      if (typeof lastPart === 'string') {
        newPrompt[prompt.length - 1] = `${lastPart}

${context.invocation.raw}`;
      } else if (lastPart && 'text' in lastPart) {
        // Create a new part object instead of mutating the old one.
        newPrompt[prompt.length - 1] = {
          ...lastPart,
          text: `${lastPart.text}

${context.invocation.raw}`,
        };
      } else {
        // It's a non-text part, so append a new text part.
        newPrompt.push({
          text: `

${context.invocation.raw}`,
        });
      }
      return newPrompt;
    }
    return prompt;
  }
}
