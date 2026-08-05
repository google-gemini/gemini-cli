/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Result of interpreting a model-provided tool-call `args` value.
 *
 * `error` is set when the value could not be interpreted at all. Callers are
 * expected to surface it to the model as a tool failure rather than throwing,
 * so one malformed function call cannot end the session.
 */
export interface ParsedToolArguments {
  args: Record<string, unknown>;
  error?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Interpret a tool call's `args`, which is model output and therefore untrusted.
 *
 * Mirrors the behavior the core local executor already applies to subagent tool
 * calls: a JSON string is parsed and used only when it decodes to a plain
 * object, anything already structured is passed through, and a value that fails
 * to parse yields an `error` for the model instead of an exception.
 */
export function parseToolCallArguments(
  toolName: string,
  rawArgs: unknown,
): ParsedToolArguments {
  if (typeof rawArgs === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawArgs);
    } catch {
      return {
        args: {},
        error:
          `Failed to parse JSON arguments for tool "${toolName}": ${rawArgs}. ` +
          `Ensure you provide a valid JSON object.`,
      };
    }
    // A valid JSON document that isn't an object (array, string, number, null)
    // carries no named arguments, so it degrades to "no arguments" rather than
    // being spread into the call.
    return { args: isPlainObject(parsed) ? { ...parsed } : {} };
  }

  return { args: isPlainObject(rawArgs) ? rawArgs : {} };
}
