/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolCallRequestInfo } from './types.js';
import {
  type HoldDirective,
  isMutatingTool,
  buildHoldDirectiveError,
} from '../services/userDirectiveService.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Result of a hold directive check on a tool call.
 */
export interface HoldDirectiveCheckResult {
  /** Whether the tool call should be blocked. */
  blocked: boolean;
  /** Error message to return to the model if blocked. */
  errorMessage?: string;
  /** The error type to use if blocked. */
  errorType?: ToolErrorType;
}

/**
 * Checks whether a tool call should be blocked due to an active hold directive.
 *
 * This guard operates at the scheduler layer, providing programmatic enforcement
 * of user hold directives that the model might otherwise ignore. It works in
 * concert with the prompt-level guidance in snippets.ts but does not depend on
 * the model actually following those instructions.
 *
 * The guard only blocks mutating tools (write_file, edit, shell, invoke_agent,
 * write_todos). Read-only tools are always permitted so the agent can continue
 * investigation and research even while a hold is active.
 *
 * @param request - The tool call request to check.
 * @param activeDirective - The currently active hold directive, or null if none.
 * @returns A check result indicating whether the call is blocked.
 */
export function checkHoldDirective(
  request: ToolCallRequestInfo,
  activeDirective: HoldDirective | null,
): HoldDirectiveCheckResult {
  // No active directive, all tools are permitted.
  if (!activeDirective) {
    return { blocked: false };
  }

  const toolName = request.name;

  // Read-only and non-mutating tools are always allowed.
  if (!isMutatingTool(toolName)) {
    return { blocked: false };
  }

  // The tool is mutating AND a hold directive is active, block it.
  debugLogger.log(
    `[HoldDirectiveGuard] Blocking mutating tool "${toolName}" due to ` +
      `active ${activeDirective.type} directive ` +
      `(matched: "${activeDirective.matchedPhrase}", ` +
      `confidence: ${activeDirective.confidence})`,
  );

  return {
    blocked: true,
    errorMessage: buildHoldDirectiveError(toolName, activeDirective),
    errorType: ToolErrorType.HOLD_DIRECTIVE_VIOLATION,
  };
}

/**
 * Checks a batch of tool call requests against an active hold directive.
 * Returns a map of callId -> check result for any blocked calls.
 *
 * This is used by the scheduler to efficiently check all tool calls in
 * a batch before entering the validation/execution pipeline.
 *
 * @param requests - The batch of tool call requests.
 * @param activeDirective - The currently active hold directive, or null.
 * @returns A map of callId -> check result for blocked calls only.
 */
export function checkHoldDirectiveBatch(
  requests: ToolCallRequestInfo[],
  activeDirective: HoldDirective | null,
): Map<string, HoldDirectiveCheckResult> {
  const blockedCalls = new Map<string, HoldDirectiveCheckResult>();

  if (!activeDirective) {
    return blockedCalls;
  }

  for (const request of requests) {
    const result = checkHoldDirective(request, activeDirective);
    if (result.blocked) {
      blockedCalls.set(request.callId, result);
    }
  }

  if (blockedCalls.size > 0) {
    debugLogger.log(
      `[HoldDirectiveGuard] Blocked ${blockedCalls.size}/${requests.length} ` +
        `tool calls in batch due to active hold directive.`,
    );
  }

  return blockedCalls;
}
