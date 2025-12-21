/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SHELL_COMMAND_NAME = 'Shell Command';

export const SHELL_NAME = 'Shell';

// Limit Gemini messages to a very high number of lines to mitigate performance
// issues in the worst case if we somehow get an enormous response from Gemini.
// This threshold is arbitrary but should be high enough to never impact normal
// usage.
export const MAX_GEMINI_MESSAGE_LINES = 65536;

export const SHELL_FOCUS_HINT_DELAY_MS = 5000;

// Tool status symbols used in ToolMessage component
export const TOOL_STATUS = {
  SUCCESS: '✓',
  PENDING: 'o',
  EXECUTING: '⊷',
  CONFIRMING: '?',
  CANCELED: '-',
  ERROR: 'x',
} as const;
