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

// Maximum number of MCP resources to display per server before truncating
export const MAX_MCP_RESOURCES_TO_SHOW = 10;

export const WARNING_PROMPT_DURATION_MS = 1000;
export const QUEUE_ERROR_DISPLAY_DURATION_MS = 3000;
export const SHELL_ACTION_REQUIRED_TITLE_DELAY_MS = 30000;
