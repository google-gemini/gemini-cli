/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const ExitCodes = {
  SUCCESS: 0,
  FATAL_AUTHENTICATION_ERROR: 41,
  FATAL_INPUT_ERROR: 42,
  FATAL_SANDBOX_ERROR: 44,
  FATAL_CONFIG_ERROR: 52,
  FATAL_TURN_LIMITED_ERROR: 53,
  FATAL_TOOL_EXECUTION_ERROR: 54,
  FATAL_UNTRUSTED_WORKSPACE_ERROR: 55,
  FATAL_CANCELLATION_ERROR: 130,
} as const;

export type ExitCode = (typeof ExitCodes)[keyof typeof ExitCodes];
