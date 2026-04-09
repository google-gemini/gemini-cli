/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SidecarConfig, PipelineDef } from './types.js';
import type { ContextEnvironment } from './environment.js';
import type { ContextWorker } from '../pipeline.js';

// Import factories
import { createToolMaskingProcessor } from '../processors/toolMaskingProcessor.js';
import { createBlobDegradationProcessor } from '../processors/blobDegradationProcessor.js';
import { createNodeTruncationProcessor } from '../processors/nodeTruncationProcessor.js';
import { createNodeDistillationProcessor } from '../processors/nodeDistillationProcessor.js';
import { createStateSnapshotProcessor } from '../processors/stateSnapshotProcessor.js';
import { createStateSnapshotWorker } from '../processors/stateSnapshotWorker.js';

export interface ContextProfile {
  config: SidecarConfig;
  buildPipelines: (env: ContextEnvironment) => PipelineDef[];
  buildWorkers: (env: ContextEnvironment) => ContextWorker[];
}

/**
 * The standard default context management profile.
 * Optimized for safety, precision, and reliable summarization.
 */
export const defaultSidecarProfile: ContextProfile = {
  config: {
    budget: {
      retainedTokens: 65000,
      maxTokens: 150000,
    },
  },
  
  buildPipelines: (env: ContextEnvironment): PipelineDef[] => [
    {
      name: 'Immediate Sanitization',
      triggers: ['new_message'],
      processors: [
        createToolMaskingProcessor('ToolMasking', env, { stringLengthThresholdTokens: 8000 }),
        createBlobDegradationProcessor('BlobDegradation', env),
      ],
    },
    {
      name: 'Normalization',
      triggers: ['retained_exceeded'],
      processors: [
        createNodeTruncationProcessor('NodeTruncation', env, { maxTokensPerNode: 3000 }),
        createNodeDistillationProcessor('NodeDistillation', env, { nodeThresholdTokens: 5000 }),
      ],
    },
    {
      name: 'Emergency Backstop',
      triggers: ['gc_backstop'],
      processors: [
        createStateSnapshotProcessor('StateSnapshotSync', env, { target: 'max' }),
      ],
    },
  ],

  buildWorkers: (env: ContextEnvironment): ContextWorker[] => [
    createStateSnapshotWorker('StateSnapshotAsync', env, { type: 'accumulate' })
  ]
};
