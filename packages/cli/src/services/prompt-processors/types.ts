/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandContext } from '../../ui/commands/types.js';

/**
 * Defines the interface for a prompt processor, a module that can transform
 * a prompt string before it is sent to the model. Processors are chained
 * together to create a processing pipeline.
 */
export interface IPromptProcessor {
  /**
   * Processes a prompt string, applying a specific transformation as part of a pipeline.
   *
   * Each processor in a command's pipeline receives the output of the previous
   * processor. This method provides the full command context, allowing for
   * complex transformations that may require access to invocation details,
   * application services, or UI state.
   *
   * @param prompt The current state of the prompt string. This may have been
   *   modified by previous processors in the pipeline.
   * @param context The full command context, providing access to invocation
   *   details (like `context.invocation.raw` and `context.invocation.args`),
   *   application services, and UI handlers.
   * @returns A promise that resolves to the transformed prompt string, which
   *   will be passed to the next processor or, if it's the last one, sent to the model.
   */
  process(prompt: string, context: CommandContext): Promise<string>;
}

/**
 * The placeholder string for shorthand argument injection in custom commands.
 */
export const SHORTHAND_ARGS_PLACEHOLDER = '{{args}}';

/**
 * The trigger string for shell command injection in custom commands.
 */
export const SHELL_INJECTION_TRIGGER = '!{';
