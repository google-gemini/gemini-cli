/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ApprovalMode,
  ASK_USER_DISPLAY_NAME,
  WRITE_FILE_DISPLAY_NAME,
  EDIT_DISPLAY_NAME,
} from '@google/gemini-cli-core';
import { ToolCallStatus } from '../types.js';

/**
 * Options for determining if a tool call should be hidden in the CLI history.
 */
export interface ShouldHideToolCallParams {
  /** The display name of the tool. */
  displayName: string;
  /** The current UI-facing status of the tool call. */
  status: ToolCallStatus;
  /** The approval mode active when the tool was called. */
  approvalMode?: ApprovalMode;
  /** Whether the tool has produced a result for display. */
  hasResultDisplay: boolean;
}

/**
 * Determines if a tool call should be hidden from the standard tool history UI.
 *
 * We hide tools in several cases:
 * 1. Ask User tools that are in progress, displayed via specialized UI.
 * 2. Ask User tools that errored without result display, typically param
 *    validation errors that the agent automatically recovers from.
 * 3. WriteFile and Edit tools when in Plan Mode, redundant because the
 *    resulting plans are displayed separately upon exiting plan mode.
 */
export function shouldHideToolCall(params: ShouldHideToolCallParams): boolean {
  const { displayName, status, approvalMode, hasResultDisplay } = params;

  switch (displayName) {
    case ASK_USER_DISPLAY_NAME:
      switch (status) {
        case ToolCallStatus.Pending:
        case ToolCallStatus.Executing:
        case ToolCallStatus.Confirming:
          return true;
        case ToolCallStatus.Error:
          return !hasResultDisplay;
        default:
          return false;
      }
    case WRITE_FILE_DISPLAY_NAME:
    case EDIT_DISPLAY_NAME:
      return approvalMode === ApprovalMode.PLAN;
    default:
      return false;
  }
}
