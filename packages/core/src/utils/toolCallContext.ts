/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contextual information for a tool call execution.
 */
export interface ToolCallContext {
  /** The unique ID of the tool call. */
  callId: string;
  /** The ID of the scheduler managing the execution. */
  schedulerId: string;
  /** The ID of the parent tool call, if this is a nested execution (e.g., in a subagent). */
  parentCallId?: string;
}

/**
 * AsyncLocalStorage instance for tool call context.
 */
const toolCallContext = new AsyncLocalStorage<ToolCallContext>();

/**
 * Runs a function within a tool call context.
 *
 * @param context The context to set.
 * @param fn The function to run.
 * @returns The result of the function.
 */
export function runWithToolCallContext<T>(
  context: ToolCallContext,
  fn: () => T,
): T {
  return toolCallContext.run(context, fn);
}

/**
 * Retrieves the current tool call context.
 *
 * @returns The current ToolCallContext, or undefined if not in a context.
 */
export function getToolCallContext(): ToolCallContext | undefined {
  return toolCallContext.getStore();
}
