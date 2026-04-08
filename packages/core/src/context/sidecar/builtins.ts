/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ProcessorRegistry } from './registry.js';
import { EmergencyTruncationProcessor, type EmergencyTruncationProcessorOptions } from '../processors/emergencyTruncationProcessor.js';
import { BlobDegradationProcessor } from '../processors/blobDegradationProcessor.js';
import { HistorySquashingProcessor, type HistorySquashingProcessorOptions } from '../processors/historySquashingProcessor.js';
import { SemanticCompressionProcessor, type SemanticCompressionProcessorOptions } from '../processors/semanticCompressionProcessor.js';
import { ToolMaskingProcessor, type ToolMaskingProcessorOptions } from '../processors/toolMaskingProcessor.js';
import { StateSnapshotProcessor, type StateSnapshotProcessorOptions } from '../processors/stateSnapshotProcessor.js';

export function registerBuiltInProcessors(registry: ProcessorRegistry) {
  registry.register<Record<string, never>>({
    id: 'BlobDegradationProcessor',
    schema: { type: 'object', properties: {} },
    create: (env) => new BlobDegradationProcessor(env),
  });

  registry.register<EmergencyTruncationProcessorOptions>({
    id: 'EmergencyTruncationProcessor',
    schema: EmergencyTruncationProcessor.schema,
    create: (env, options) => EmergencyTruncationProcessor.create(env, options),
  });

  registry.register<HistorySquashingProcessorOptions>({
    id: 'HistorySquashingProcessor',
    schema: HistorySquashingProcessor.schema,
    create: (env, options) => HistorySquashingProcessor.create(env, options),
  });

  registry.register<SemanticCompressionProcessorOptions>({
    id: 'SemanticCompressionProcessor',
    schema: SemanticCompressionProcessor.schema,
    create: (env, options) => SemanticCompressionProcessor.create(env, options),
  });

  registry.register<ToolMaskingProcessorOptions>({
    id: 'ToolMaskingProcessor',
    schema: ToolMaskingProcessor.schema,
    create: (env, options) => ToolMaskingProcessor.create(env, options),
  });

  registry.register<StateSnapshotProcessorOptions>({
    id: 'StateSnapshotProcessor',
    schema: {}, // Will be added later
    create: (env, options) => StateSnapshotProcessor.create(env, options),
  });
}
