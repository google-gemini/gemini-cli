/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApprovalMode } from '../policy/types.js';
import { CoreToolCallStatus, type ToolCall } from '../scheduler/types.js';
import {
  ASK_USER_DISPLAY_NAME,
  WRITE_FILE_DISPLAY_NAME,
  EDIT_DISPLAY_NAME,
  UPDATE_TOPIC_TOOL_NAME,
  UPDATE_TOPIC_DISPLAY_NAME,
} from '../tools/tool-names.js';

export interface ToolVisibilityContext {
  /** The internal name of the tool. */
  name: string;
  /** The display name of the tool. */
  displayName?: string;
  /** The current status of the tool call. */
  status: CoreToolCallStatus;
  /** The approval mode active when the tool was called. */
  approvalMode?: ApprovalMode;
  /** Whether the tool has produced a result for display (e.g., resultDisplay or liveOutput). */
  hasResult: boolean;
  /** The ID of the parent tool call, if any. */
  parentCallId?: string;
  /** True if the tool was initiated directly by the user via a slash command. */
  isClientInitiated?: boolean;
}

/**
 * Maps a core ToolCall to a ToolVisibilityContext.
 */
export function buildToolVisibilityContext(
  tc: ToolCall,
): ToolVisibilityContext {
  let hasResult = false;
  if (
    tc.status === CoreToolCallStatus.Success ||
    tc.status === CoreToolCallStatus.Error ||
    tc.status === CoreToolCallStatus.Cancelled
  ) {
    hasResult = !!tc.response.resultDisplay;
  } else if (tc.status === CoreToolCallStatus.Executing) {
    hasResult = !!tc.liveOutput;
  }

  return {
    name: tc.request.name,
    displayName: tc.tool?.displayName ?? tc.request.name,
    status: tc.status,
    approvalMode: tc.approvalMode,
    hasResult,
    parentCallId: tc.request.parentCallId,
    isClientInitiated: tc.request.isClientInitiated,
  };
}

/**
 * Determines if a tool should ever appear as a completed block in the main chat log.
 */
export function isRenderedInHistory(ctx: ToolVisibilityContext): boolean {
  if (ctx.parentCallId) {
    return false;
  }

  const displayName = ctx.displayName ?? ctx.name;

  switch (displayName) {
    case ASK_USER_DISPLAY_NAME:
      // We only render AskUser in history if it errored with a result or succeeded.
      // If it errored without a result, it was an internal validation failure.
      if (ctx.status === CoreToolCallStatus.Error) {
        return ctx.hasResult;
      }
      return ctx.status === CoreToolCallStatus.Success;

    case WRITE_FILE_DISPLAY_NAME:
    case EDIT_DISPLAY_NAME:
      // In Plan Mode, edits are redundant because the plan shows the diffs.
      return ctx.approvalMode !== ApprovalMode.PLAN;

    default:
      return true;
  }
}

/**
 * Determines if a tool belongs in the Awaiting Approval confirmation queue.
 */
export function belongsInConfirmationQueue(
  ctx: ToolVisibilityContext,
): boolean {
  const displayName = ctx.displayName ?? ctx.name;

  // Narrative background tools auto-execute and never require confirmation
  if (
    ctx.name === UPDATE_TOPIC_TOOL_NAME ||
    displayName === UPDATE_TOPIC_DISPLAY_NAME
  ) {
    return false;
  }

  // All other standard tools could theoretically require confirmation
  return true;
}

/**
 * Determines if a tool should be actively rendered in the dynamic ToolGroupMessage UI right now.
 * This takes into account current execution states and UI settings.
 */
export function isVisibleInToolGroup(
  ctx: ToolVisibilityContext,
  errorVerbosity: 'full' | 'low',
): boolean {
  const displayName = ctx.displayName ?? ctx.name;

  // Hide internal errors unless the user explicitly requested full verbosity
  if (
    errorVerbosity === 'low' &&
    ctx.status === CoreToolCallStatus.Error &&
    !ctx.isClientInitiated
  ) {
    return false;
  }

  // We hide AskUser while it's in progress because it renders in its own modal.
  // We also hide terminal states that don't meet history rendering criteria (e.g. errors without results).
  if (displayName === ASK_USER_DISPLAY_NAME) {
    switch (ctx.status) {
      case CoreToolCallStatus.Scheduled:
      case CoreToolCallStatus.Validating:
      case CoreToolCallStatus.Executing:
      case CoreToolCallStatus.AwaitingApproval:
        return false;
      case CoreToolCallStatus.Error:
        return ctx.hasResult;
      case CoreToolCallStatus.Success:
        return true;
      default:
        return false;
    }
  }

  // In Plan Mode, edits are redundant because the plan shows the diffs.
  if (
    (displayName === WRITE_FILE_DISPLAY_NAME ||
      displayName === EDIT_DISPLAY_NAME) &&
    ctx.approvalMode === ApprovalMode.PLAN
  ) {
    return false;
  }

  // We hide confirming tools from the active group because they render in the
  // ToolConfirmationQueue at the bottom of the screen instead.
  if (ctx.status === CoreToolCallStatus.AwaitingApproval) {
    return false;
  }

  return true;
}
