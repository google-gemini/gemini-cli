/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AgentHistoryProviderConfig {
  maxTokens: number;
  retainedTokens: number;
  normalMessageTokens: number;
  maximumMessageTokens: number;
  normalizationHeadRatio: number;
  isSummarizationEnabled: boolean;
  isTruncationEnabled: boolean;
}
