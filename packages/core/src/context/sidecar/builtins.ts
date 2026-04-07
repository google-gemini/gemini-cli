/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProcessorRegistry } from './registry.js';
import {
  ToolMaskingProcessor,
  type ToolMaskingProcessorOptions,
} from '../processors/toolMaskingProcessor.js';
import { BlobDegradationProcessor } from '../processors/blobDegradationProcessor.js';
import {
  SemanticCompressionProcessor,
  type SemanticCompressionProcessorOptions,
} from '../processors/semanticCompressionProcessor.js';
import {
  HistorySquashingProcessor,
  type HistorySquashingProcessorOptions,
} from '../processors/historySquashingProcessor.js';
import {
  StateSnapshotProcessor,
  type StateSnapshotProcessorOptions,
} from '../processors/stateSnapshotProcessor.js';
import {
  EmergencyTruncationProcessor,
  type EmergencyTruncationProcessorOptions,
} from '../processors/emergencyTruncationProcessor.js';

export function registerBuiltInProcessors(registry: ProcessorRegistry) {
  registry.register<ToolMaskingProcessorOptions>({
    id: 'ToolMaskingProcessor',
    schema: {
      type: 'object',
      properties: {
        processorId: { const: 'ToolMaskingProcessor' },
        options: {
          type: 'object',
          properties: { stringLengthThresholdTokens: { type: 'number' } },
          required: ['stringLengthThresholdTokens'],
        },
      },
      required: ['processorId', 'options'],
    },
    create: (env, opts) => new ToolMaskingProcessor(env, opts),
  });

  registry.register<Record<string, never>>({
    id: 'BlobDegradationProcessor',
    schema: {
      type: 'object',
      properties: {
        processorId: { const: 'BlobDegradationProcessor' },
        options: { type: 'object' },
      },
      required: ['processorId'],
    },
    create: (env) => new BlobDegradationProcessor(env),
  });

  registry.register<SemanticCompressionProcessorOptions>({
    id: 'SemanticCompressionProcessor',
    schema: {
      type: 'object',
      properties: {
        processorId: { const: 'SemanticCompressionProcessor' },
        options: {
          type: 'object',
          properties: { nodeThresholdTokens: { type: 'number' } },
          required: ['nodeThresholdTokens'],
        },
      },
      required: ['processorId', 'options'],
    },
    create: (env, opts) => new SemanticCompressionProcessor(env, opts),
  });

  registry.register<HistorySquashingProcessorOptions>({
    id: 'HistorySquashingProcessor',
    schema: {
      type: 'object',
      properties: {
        processorId: { const: 'HistorySquashingProcessor' },
        options: {
          type: 'object',
          properties: { maxTokensPerNode: { type: 'number' } },
          required: ['maxTokensPerNode'],
        },
      },
      required: ['processorId', 'options'],
    },
    create: (env, opts) => new HistorySquashingProcessor(env, opts),
  });

  registry.register<StateSnapshotProcessorOptions>({
    id: 'StateSnapshotProcessor',
    schema: {
      type: 'object',
      properties: {
        processorId: { const: 'StateSnapshotProcessor' },
        options: {
          type: 'object',
          properties: {
            model: { type: 'string' },
            systemInstruction: { type: 'string' },
            triggerDeficitTokens: { type: 'number' },
          },
        },
      },
      required: ['processorId'],
    },
    create: (env, opts) => StateSnapshotProcessor.create(env, opts),
  });

  registry.register<EmergencyTruncationProcessorOptions>({
    id: 'EmergencyTruncationProcessor',
    schema: {
      type: 'object',
      properties: {
        processorId: { const: 'EmergencyTruncationProcessor' },
        options: { type: 'object' },
      },
      required: ['processorId'],
    },
    create: (env, opts) => EmergencyTruncationProcessor.create(env, opts),
  });
}
