/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ACTIVE_SHELL_MAX_LINES,
  COMPLETED_SHELL_MAX_LINES,
} from '../constants.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

/**
 * Constants used for calculating available height for tool results.
 * These MUST be kept in sync between ToolGroupMessage (for overflow detection)
 * and ToolResultDisplay (for actual truncation).
 */
export const TOOL_RESULT_STATIC_HEIGHT = 1;
export const TOOL_RESULT_ASB_RESERVED_LINE_COUNT = 6;
export const TOOL_RESULT_STANDARD_RESERVED_LINE_COUNT = 2;
export const TOOL_RESULT_MIN_LINES_SHOWN = 2;

/**
 * Calculates the final height available for the content of a tool result display.
 *
 * This accounts for:
 * 1. The static height of the tool message (name, status line).
 * 2. Reserved space for hints and padding (different in ASB vs Standard mode).
 * 3. Enforcing a minimum number of lines shown.
 */
export function calculateToolContentMaxLines(options: {
  availableTerminalHeight: number | undefined;
  isAlternateBuffer: boolean;
  maxLinesLimit?: number;
}): number | undefined {
  const { availableTerminalHeight, isAlternateBuffer, maxLinesLimit } = options;

  const reservedLines = isAlternateBuffer
    ? TOOL_RESULT_ASB_RESERVED_LINE_COUNT
    : TOOL_RESULT_STANDARD_RESERVED_LINE_COUNT;

  let contentHeight = availableTerminalHeight
    ? Math.max(
        availableTerminalHeight - TOOL_RESULT_STATIC_HEIGHT - reservedLines,
        TOOL_RESULT_MIN_LINES_SHOWN + 1,
      )
    : undefined;

  if (maxLinesLimit) {
    contentHeight =
      contentHeight !== undefined
        ? Math.min(contentHeight, maxLinesLimit)
        : maxLinesLimit;
  }

  return contentHeight;
}

/**
 * Calculates the maximum number of lines to display for shell output.
 *
 * This logic distinguishes between:
 * 1. Process Status: Active (Executing) vs Completed.
 * 2. UI Focus: Whether the user is currently interacting with the shell.
 * 3. Expansion State: Whether the user has explicitly requested to "Show More Lines" (CTRL+O).
 */
export function calculateShellMaxLines(options: {
  status: CoreToolCallStatus;
  isAlternateBuffer: boolean;
  isThisShellFocused: boolean;
  availableTerminalHeight: number | undefined;
  constrainHeight: boolean;
  isExpandable: boolean | undefined;
}): number | undefined {
  const {
    status,
    isAlternateBuffer,
    isThisShellFocused,
    availableTerminalHeight,
    constrainHeight,
    isExpandable,
  } = options;

  // 1. If the user explicitly requested expansion (unconstrained), remove all caps.
  if (!constrainHeight && isExpandable) {
    return undefined;
  }

  // 2. Handle cases where height is unknown (Standard mode history).
  if (availableTerminalHeight === undefined) {
    return isAlternateBuffer ? ACTIVE_SHELL_MAX_LINES : undefined;
  }

  const maxLinesBasedOnHeight = Math.max(1, availableTerminalHeight - 2);

  // 3. Handle ASB mode focus expansion.
  // We allow a focused shell in ASB mode to take up the full available height,
  // BUT only if we aren't trying to maintain a constrained view (e.g., history items).
  if (isAlternateBuffer && isThisShellFocused && !constrainHeight) {
    return maxLinesBasedOnHeight;
  }

  // 4. Fall back to process-based constants.
  const isExecuting = status === CoreToolCallStatus.Executing;
  const shellMaxLinesLimit = isExecuting
    ? ACTIVE_SHELL_MAX_LINES
    : COMPLETED_SHELL_MAX_LINES;

  return Math.min(maxLinesBasedOnHeight, shellMaxLinesLimit);
}
