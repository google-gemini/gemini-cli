/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, PartListUnion } from '@google/genai';
/**
 * The return type for a command action that results in scheduling a tool call.
 */
export interface ToolActionReturn {
  type: 'tool';
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/**
 * The return type for a command action that results in a simple message
 * being displayed to the user.
 */
export interface MessageActionReturn {
  type: 'message';
  messageType: 'info' | 'error';
  content: string;
}

/**
 * The return type for a command action that results in replacing
 * the entire conversation history.
 */
export interface LoadHistoryActionReturn<HistoryType = unknown> {
  type: 'load_history';
  history: HistoryType;
  clientHistory: Content[]; // The history for the generative client
}

/**
 * The return type for a command action that should immediately submit
 * content as a prompt to the Gemini model.
 */
export interface SubmitPromptActionReturn {
  type: 'submit_prompt';
  content: PartListUnion;
}

/**
 * The return type for a command action that results in clearing
 * the entire session (resetting chat and generating a new session ID).
 */
export interface ClearSessionActionReturn {
  type: 'clear_session';
}

export type CommandActionReturn<HistoryType = unknown> =
  | ToolActionReturn
  | MessageActionReturn
  | LoadHistoryActionReturn<HistoryType>
  | SubmitPromptActionReturn
  | ClearSessionActionReturn;
