/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const ExitCodes = {
  SUCCESS: 0,
  FATAL_AUTHENTICATION_ERROR: 41,
  FATAL_INPUT_ERROR: 42,
  FATAL_CONFIG_ERROR: 52,
  FATAL_CANCELLATION_ERROR: 130,
} as const;
