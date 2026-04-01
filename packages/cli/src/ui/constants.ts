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

export const WARNING_PROMPT_DURATION_MS = 3000;
export const QUEUE_ERROR_DISPLAY_DURATION_MS = 3000;
export const SHELL_ACTION_REQUIRED_TITLE_DELAY_MS = 30000;
export const SHELL_SILENT_WORKING_TITLE_DELAY_MS = 120000;
export const EXPAND_HINT_DURATION_MS = 5000;

export const DEFAULT_BACKGROUND_OPACITY = 0.16;
export const DEFAULT_INPUT_BACKGROUND_OPACITY = 0.24;
export const DEFAULT_SELECTION_OPACITY = 0.2;
export const DEFAULT_BORDER_OPACITY = 0.4;

export const KEYBOARD_SHORTCUTS_URL =
  'https://geminicli.com/docs/cli/keyboard-shortcuts/';
export const LRU_BUFFER_PERF_CACHE_LIMIT = 20000;

// Max lines to show for active shell output when not focused
export const ACTIVE_SHELL_MAX_LINES = 15;

// Max lines to preserve in history for completed shell commands
export const COMPLETED_SHELL_MAX_LINES = 15;

// Max lines to show for subagent results before collapsing
export const SUBAGENT_MAX_LINES = 15;

/** Minimum terminal width required to show the full context used label */
export const MIN_TERMINAL_WIDTH_FOR_FULL_LABEL = 100;

/** Default context usage fraction at which to trigger compression */
export const DEFAULT_COMPRESSION_THRESHOLD = 0.5;

/** Documentation URL for skills setup and configuration */
export const SKILLS_DOCS_URL =
  'https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md';

/** Max lines to show for a compact tool subview (e.g. diff) */
export const COMPACT_TOOL_SUBVIEW_MAX_LINES = 15;

// Maximum number of UTF-16 code units to retain in a background task's output
// buffer. Beyond this, the oldest output is dropped to keep memory bounded.
// 10 MB is large enough for ~200,000 lines of terminal output and stays well
// below the V8 string length limit (~1 GB) even with multiple concurrent tasks.
export const MAX_SHELL_OUTPUT_SIZE = 10_000_000; // 10 MB

// Truncation is triggered only once the output exceeds
// MAX_SHELL_OUTPUT_SIZE + SHELL_OUTPUT_TRUNCATION_BUFFER, then sliced back to
// MAX_SHELL_OUTPUT_SIZE. This avoids an O(n) string copy on every appended
// chunk, amortizing the cost to once per SHELL_OUTPUT_TRUNCATION_BUFFER bytes
// of new input (i.e. once per ~1 MB on a busy shell).
export const SHELL_OUTPUT_TRUNCATION_BUFFER = 1_000_000; // 1 MB
