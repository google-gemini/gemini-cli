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

/** Layout constants for dialog components */
export const DIALOG_PADDING = 2;
export const DIALOG_HEADER_HEIGHT = 2;
export const DIALOG_CONTROLS_HEIGHT = 2;

/** Layout constants for ThemeDialog component */
export const THEME_DIALOG_PREVIEW_PANE_WIDTH_PERCENTAGE = 0.55;
export const THEME_DIALOG_SELECTION_PANE_WIDTH_PERCENTAGE = 0.45;
/** A safety margin to prevent text from touching the border in the preview pane. */
export const THEME_DIALOG_PREVIEW_PANE_WIDTH_SAFETY_MARGIN = 0.9;
/** Combined horizontal padding from the dialog and preview pane. */
export const THEME_DIALOG_TOTAL_HORIZONTAL_PADDING = 4;
/** Vertical space taken by elements other than the two code blocks in the preview pane.
 * Includes "Preview" title, borders, and margin between blocks.
 */
export const THEME_DIALOG_PREVIEW_PANE_FIXED_VERTICAL_SPACE = 8;
export const THEME_DIALOG_TAB_TO_SELECT_HEIGHT = 2;
export const THEME_DIALOG_PREVIEW_CODE_BLOCK_HEIGHT_PERCENTAGE = 0.6;
export const THEME_DIALOG_PREVIEW_DIFF_HEIGHT_PERCENTAGE = 0.4;
export const THEME_DIALOG_COLUMN_PADDING = 2;
export const THEME_DIALOG_MAX_ITEMS_TO_SHOW = 12;
