/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AsyncPipelineDef,
  ContextManagementConfig,
  PipelineDef,
} from './types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';

// Import factories
import { createToolMaskingProcessor } from '../processors/toolMaskingProcessor.js';
import { createBlobDegradationProcessor } from '../processors/blobDegradationProcessor.js';
import { createNodeTruncationProcessor } from '../processors/nodeTruncationProcessor.js';
import { createNodeDistillationProcessor } from '../processors/nodeDistillationProcessor.js';
import { createStateSnapshotProcessor } from '../processors/stateSnapshotProcessor.js';
import { createStateSnapshotAsyncProcessor } from '../processors/stateSnapshotAsyncProcessor.js';

/**
 * Helper to safely merge static default options with dynamically loaded
 * JSON overrides from the SidecarConfig.
 *
 * Why the unsafe cast is acceptable here:
 * Before the \`config\` object ever reaches this function, \`SidecarLoader.ts\`
 * passes the raw JSON through \`SchemaValidator\`. The schema dynamically generates
 * a \`oneOf\` map linking every \`type\` discriminator to its corresponding processor
 * schema definition. By the time we access \`options\` here, its shape has been
 * strictly validated against the corresponding Zod/JSONSchema definition at runtime,
 * making the generic cast to \`<T>\` structurally safe.
 */
function resolveProcessorOptions<T>(
  config: ContextManagementConfig | undefined,
  id: string,
  defaultOptions: T,
): T {
  if (config?.processorOptions && config.processorOptions[id]) {
    return {
      ...defaultOptions,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      ...(config.processorOptions[id].options as T),
    };
  }
  return defaultOptions;
}

export interface ContextProfile {
  config: ContextManagementConfig;
  buildPipelines: (
    env: ContextEnvironment,
    config?: ContextManagementConfig,
  ) => PipelineDef[];
  buildAsyncPipelines: (
    env: ContextEnvironment,
    config?: ContextManagementConfig,
  ) => AsyncPipelineDef[];
}

/**
 * The standard default context management profile.
 * Optimized for safety, precision, and reliable summarization.
 */
export const defaultContextProfile: ContextProfile = {
  config: {
    budget: {
      retainedTokens: 65000,
      maxTokens: 150000,
    },
  },

  buildPipelines: (
    env: ContextEnvironment,
    config?: ContextManagementConfig,
  ): PipelineDef[] =>
    // Helper to merge default options with dynamically loaded processorOptions by ID
    [
      {
        name: 'Immediate Sanitization',
        triggers: ['new_message'],
        processors: [
          createToolMaskingProcessor(
            'ToolMasking',
            env,
            resolveProcessorOptions(config, 'ToolMasking', {
              stringLengthThresholdTokens: 8000,
            }),
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
            resolveProcessorOptions(config, 'NodeTruncation', {
              maxTokensPerNode: 3000,
            }),
          ),
          createNodeDistillationProcessor(
            'NodeDistillation',
            env,
            resolveProcessorOptions(config, 'NodeDistillation', {
              nodeThresholdTokens: 5000,
            }),
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
            resolveProcessorOptions(config, 'StateSnapshotSync', {
              target: 'max',
            }),
          ),
        ],
      },
    ],
  buildAsyncPipelines: (
    env: ContextEnvironment,
    config?: ContextManagementConfig,
  ): AsyncPipelineDef[] => [
    {
      name: 'Async Background GC',
      triggers: ['nodes_aged_out'],
      processors: [
        createStateSnapshotAsyncProcessor(
          'StateSnapshotAsync',
          env,
          resolveProcessorOptions(config, 'StateSnapshotAsync', {
            type: 'accumulate',
          }),
        ),
      ],
    },
  ],
};
