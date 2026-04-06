/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SidecarConfig } from './types.js';

/**
 * The standard default context management profile.
 * Optimized for safety, precision, and reliable summarization.
 */
export const defaultSidecarProfile: SidecarConfig = {
  budget: {
    retainedTokens: 65000,
    maxTokens: 150000,
  },
  gcBackstop: {
    strategy: 'truncate',
    target: 'incremental',
    freeTokensTarget: 10000,
  },
  pipelines: [
    {
      name: 'Immediate Sanitization',
      triggers: ['on_turn'],
      processors: [
        { processorId: 'ToolMaskingProcessor', options: { stringLengthThresholdTokens: 8000 } },
        { processorId: 'BlobDegradationProcessor', options: {} },
        { processorId: 'SemanticCompressionProcessor', options: { nodeThresholdTokens: 5000, contextWindowPercentage: 0.2 } },
        { processorId: 'EmergencyTruncationProcessor', options: {} }
      ]
    },
    {
      name: 'Deep Background Compression',
      triggers: [{ type: 'timer', intervalMs: 5000 }, 'budget_exceeded'],
      processors: [
        { processorId: 'HistorySquashingProcessor', options: { maxTokensPerNode: 3000 } },
        { processorId: 'StateSnapshotProcessor', options: {} }
      ]
    }
  ]
};
