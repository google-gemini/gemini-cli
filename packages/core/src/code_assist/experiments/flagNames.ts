/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const ExperimentFlags = {
  CONTEXT_COMPRESSION_THRESHOLD: 45740197,
  USER_CACHING: 45740198,
  BANNER_TEXT_NO_CAPACITY_ISSUES: 45740199,
  BANNER_TEXT_CAPACITY_ISSUES: 45740200,
  ENABLE_PREVIEW: 45740196,
} as const;

export type ExperimentFlagName =
  (typeof ExperimentFlags)[keyof typeof ExperimentFlags];
