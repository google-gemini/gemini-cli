/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCallConfirmationDetails } from '@gemini-code/server';
import { FunctionDeclaration } from '@google/genai';

/**
 * Interface representing the base Tool functionality
 */
export interface Tool<
  TParams = unknown,
  TResult extends ToolResult = ToolResult,
> {
  /**
   * The internal name of the tool (used for API calls)
   */
  name: string;

  /**
   * The user-friendly display name of the tool
   */
  displayName: string;

  /**
   * Description of what the tool does
   */
  description: string;

  /**
   * Function declaration schema from @google/genai
   */
  schema: FunctionDeclaration;

  /**
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  validateToolParams(params: TParams): string | null;

  /**
   * Gets a pre-execution description of the tool operation
   * @param params Parameters for the tool execution
   * @returns A markdown string describing what the tool will do
   * Optional for backward compatibility
   */
  getDescription(params: TParams): string;

  /**
   * Determines if the tool should prompt for confirmation before execution
   * @param params Parameters for the tool execution
   * @returns Whether execute should be confirmed.
   */
  shouldConfirmExecute(
    params: TParams,
  ): Promise<ToolCallConfirmationDetails | false>;

  /**
   * Executes the tool with the given parameters
   * @param params Parameters for the tool execution
   * @returns Result of the tool execution
   */
  execute(params: TParams): Promise<TResult>;
}

export interface ToolResult {
  /**
   * Content meant to be included in LLM history.
   * This should represent the factual outcome of the tool execution.
   */
  llmContent: string;

  /**
   * Markdown string for user display.
   * This provides a user-friendly summary or visualization of the result.
   */
  returnDisplay: ToolResultDisplay;
}

export type ToolResultDisplay = string | FileDiff;

export interface FileDiff {
  fileDiff: string;
}
