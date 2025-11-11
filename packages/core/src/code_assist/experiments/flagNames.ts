/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const ExperimentFlags = {
  CONTEXT_COMPRESSION_THRESHOLD:
    'GeminiCLIContextCompression__threshold_fraction',
  USER_CACHING: 'GcliUserCaching__user_caching',
} as const;

export type ExperimentFlagName =
  (typeof ExperimentFlags)[keyof typeof ExperimentFlags];
