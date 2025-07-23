/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Defines the interface for a prompt processor, a module that can transform
 * a prompt string before it is sent to the model. Processors are chained
 * together to create a processing pipeline.
 */
export interface IPromptProcessor {
  /**
   * Processes a prompt string, applying a specific transformation.
   *
   * @param prompt The current state of the prompt string.
   * @param args The raw argument string from the user's command invocation.
   * @param fullCommand The full command the user typed (e.g., /git:commit foo).
   * @returns The transformed prompt string as a Promise.
   *
   * @todo Add `context: CommandContext` back when more complex processors
   * that require access to services or UI are needed.
   */
  process(prompt: string, args: string, fullCommand: string): Promise<string>;
}

/**
 * The placeholder string for shorthand argument injection in custom commands.
 */
export const SHORTHAND_ARGS_PLACEHOLDER = '{{args}}';
