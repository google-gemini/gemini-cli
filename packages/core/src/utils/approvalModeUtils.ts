/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ApprovalMode } from '../policy/types.js';
import { checkExhaustive } from './checks.js';

/**
 * Returns a human-readable description for an approval mode.
 */
export function getApprovalModeDescription(mode: ApprovalMode): string {
  switch (mode) {
    case ApprovalMode.AUTO_EDIT:
      return 'Auto-Edit mode (edits will be applied automatically)';
    case ApprovalMode.DEFAULT:
      return 'Default mode (edits will require confirmation)';
    case ApprovalMode.PLAN:
      return 'Plan mode (read-only planning)';
    case ApprovalMode.YOLO:
      return 'YOLO mode (all tool calls auto-approved)';
    default:
      return checkExhaustive(mode);
  }
}

/**
 * Generates a consistent message for plan mode transitions.
 */
export function getPlanModeExitMessage(
  newMode: ApprovalMode,
  isManual: boolean = false,
): string {
  const description = getApprovalModeDescription(newMode);
  const prefix = isManual
    ? 'User has manually exited Plan Mode.'
    : 'Plan approved.';
  return `${prefix} Switching to ${description}.`;
}
