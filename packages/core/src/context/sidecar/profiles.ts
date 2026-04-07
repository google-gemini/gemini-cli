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
  pipelines: [
    {
      name: 'Immediate Sanitization',
      triggers: ['new_message'],
      execution: 'blocking',
      processors: [
        {
          processorId: 'ToolMaskingProcessor',
          options: { stringLengthThresholdTokens: 8000 },
        },
        { processorId: 'BlobDegradationProcessor', options: {} },
      ],
    },
    {
      name: 'Deep Background Compression',
      triggers: [{ type: 'timer', intervalMs: 5000 }, 'retained_exceeded'],
      execution: 'background',
      processors: [
        {
          processorId: 'HistorySquashingProcessor',
          options: { maxTokensPerNode: 3000 },
        },
        {
          processorId: 'SemanticCompressionProcessor',
          options: { nodeThresholdTokens: 5000 },
        },
        { processorId: 'StateSnapshotProcessor', options: {} },
      ],
    },
    {
      name: 'Emergency Backstop',
      triggers: ['gc_backstop'],
      execution: 'blocking',
      processors: [
        { processorId: 'StateSnapshotProcessor', options: {} },
        { processorId: 'EmergencyTruncationProcessor', options: {} },
      ],
    },
  ],
};
