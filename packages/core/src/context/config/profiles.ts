/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AsyncPipelineDef, SidecarConfig, PipelineDef } from './types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';

// Import factories
import { createToolMaskingProcessor } from '../processors/toolMaskingProcessor.js';
import { createBlobDegradationProcessor } from '../processors/blobDegradationProcessor.js';
import { createNodeTruncationProcessor } from '../processors/nodeTruncationProcessor.js';
import { createNodeDistillationProcessor } from '../processors/nodeDistillationProcessor.js';
import { createStateSnapshotProcessor } from '../processors/stateSnapshotProcessor.js';
import { createStateSnapshotAsyncProcessor } from '../processors/stateSnapshotAsyncProcessor.js';

export interface ContextProfile {
  config: SidecarConfig;
  buildPipelines: (
    env: ContextEnvironment,
    config?: SidecarConfig,
  ) => PipelineDef[];
  buildAsyncPipelines: (
    env: ContextEnvironment,
    config?: SidecarConfig,
  ) => AsyncPipelineDef[];
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

  buildPipelines: (
    env: ContextEnvironment,
    config?: SidecarConfig,
  ): PipelineDef[] => {
    // Helper to merge default options with dynamically loaded processorOptions by ID
    const getOptions = <T>(id: string, defaultOptions: T): T => {
      if (config?.processorOptions && config.processorOptions[id]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        return {
          ...defaultOptions,
          ...(config.processorOptions[id].options as T),
        };
      }
      return defaultOptions;
    };

    return [
      {
        name: 'Immediate Sanitization',
        triggers: ['new_message'],
        processors: [
          createToolMaskingProcessor(
            'ToolMasking',
            env,
            getOptions('ToolMasking', { stringLengthThresholdTokens: 8000 }),
          ),
          createBlobDegradationProcessor('BlobDegradation', env), // No options
        ],
      },
      {
        name: 'Normalization',
        triggers: ['retained_exceeded'],
        processors: [
          createNodeTruncationProcessor(
            'NodeTruncation',
            env,
            getOptions('NodeTruncation', { maxTokensPerNode: 3000 }),
          ),
          createNodeDistillationProcessor(
            'NodeDistillation',
            env,
            getOptions('NodeDistillation', { nodeThresholdTokens: 5000 }),
          ),
        ],
      },
      {
        name: 'Emergency Backstop',
        triggers: ['gc_backstop'],
        processors: [
          createStateSnapshotProcessor(
            'StateSnapshotSync',
            env,
            getOptions('StateSnapshotSync', { target: 'max' }),
          ),
        ],
      },
    ];
  },

  buildAsyncPipelines: (
    env: ContextEnvironment,
    config?: SidecarConfig,
  ): AsyncPipelineDef[] => {
    const getOptions = <T>(id: string, defaultOptions: T): T => {
      if (config?.processorOptions && config.processorOptions[id]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        return {
          ...defaultOptions,
          ...(config.processorOptions[id].options as T),
        };
      }
      return defaultOptions;
    };

    return [
      {
        name: 'Async Background GC',
        triggers: ['nodes_aged_out'],
        processors: [
          createStateSnapshotAsyncProcessor(
            'StateSnapshotAsync',
            env,
            getOptions('StateSnapshotAsync', { type: 'accumulate' }),
          ),
        ],
      },
    ];
  },
};
