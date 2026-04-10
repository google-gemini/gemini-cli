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
  workers: [
    {
      workerId: 'StateSnapshotWorker',
      options: {
        type: 'accumulate',
      },
    },
  ],
  pipelines: [
    {
      name: 'Immediate Sanitization',
      triggers: ['new_message'],
      processors: [
        {
          processorId: 'ToolMaskingProcessor',
          options: { stringLengthThresholdTokens: 8000 },
        },
        { processorId: 'BlobDegradationProcessor', options: {} },
      ],
    },
    {
      name: 'Normalization',
      triggers: ['retained_exceeded'],
      processors: [
        {
          processorId: 'NodeTruncationProcessor',
          options: { maxTokensPerNode: 3000 },
        },
        {
          processorId: 'NodeDistillationProcessor',
          options: { nodeThresholdTokens: 5000 },
        },
      ],
    },
    {
      name: 'Emergency Backstop',
      triggers: ['gc_backstop'],
      processors: [
        {
          processorId: 'StateSnapshotProcessor',
          options: { target: 'max' },
        },
      ],
    },
  ],
};
