/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext } from '../../ui/commands/types.js';
import type { PartUnion } from '@google/genai';

/**
 * Defines the input/output type for prompt processors.
 */
export type PromptPipelineContent = PartUnion[];

/**
 * Defines the interface for a prompt processor, a module that can transform
 * a prompt string before it is sent to the model. Processors are chained
 * together to create a processing pipeline.
 */
export interface IPromptProcessor {
  /**
   * Processes a prompt input (which may contain text and multi-modal parts),
   * applying a specific transformation as part of a pipeline.
   *
   * @param prompt The current state of the prompt string. This may have been
   *   modified by previous processors in the pipeline.
   * @param context The full command context, providing access to invocation
   *   details (like `context.invocation.raw` and `context.invocation.args`),
   *   application services, and UI handlers.
   * @returns A promise that resolves to the transformed prompt string, which
   *   will be passed to the next processor or, if it's the last one, sent to the model.
   */
  process(
    prompt: PromptPipelineContent,
    context: CommandContext,
  ): Promise<PromptPipelineContent>;
}

/**
 * The placeholder string for shorthand argument injection in custom commands.
 * When used outside of !{...}, arguments are injected raw.
 * When used inside !{...}, arguments are shell-escaped.
 */
export const SHORTHAND_ARGS_PLACEHOLDER = '{{args}}';

/**
 * The trigger string for shell command injection in custom commands.
 */
export const SHELL_INJECTION_TRIGGER = '!{';

/**
 * The trigger string for at file injection in custom commands.
 */
export const AT_FILE_INJECTION_TRIGGER = '@{';
