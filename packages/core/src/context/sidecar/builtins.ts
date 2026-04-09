/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SidecarRegistry } from './registry.js';
import { HistoryTruncationProcessor, type HistoryTruncationProcessorOptions } from '../processors/historyTruncationProcessor.js';
import { BlobDegradationProcessor } from '../processors/blobDegradationProcessor.js';
import { NodeTruncationProcessor, type NodeTruncationProcessorOptions } from '../processors/nodeTruncationProcessor.js';
import { NodeDistillationProcessor, type NodeDistillationProcessorOptions } from '../processors/nodeDistillationProcessor.js';
import { ToolMaskingProcessor, type ToolMaskingProcessorOptions } from '../processors/toolMaskingProcessor.js';
import { StateSnapshotProcessor, type StateSnapshotProcessorOptions } from '../processors/stateSnapshotProcessor.js';
import { StateSnapshotWorker, type StateSnapshotWorkerOptions } from '../processors/stateSnapshotWorker.js';
import { RollingSummaryProcessor, type RollingSummaryProcessorOptions } from '../processors/rollingSummaryProcessor.js';

export function registerBuiltInProcessors(registry: SidecarRegistry) {
  registry.registerProcessor<Record<string, never>>({
    id: 'BlobDegradationProcessor',
    schema: { type: 'object', properties: {} },
    create: (env) => new BlobDegradationProcessor(env),
  });

  registry.registerProcessor<HistoryTruncationProcessorOptions>({
    id: 'HistoryTruncationProcessor',
    schema: HistoryTruncationProcessor.schema,
    create: (env, options) => HistoryTruncationProcessor.create(env, options),
  });

  registry.registerProcessor<NodeTruncationProcessorOptions>({
    id: 'NodeTruncationProcessor',
    schema: NodeTruncationProcessor.schema,
    create: (env, options) => NodeTruncationProcessor.create(env, options),
  });

  registry.registerProcessor<NodeDistillationProcessorOptions>({
    id: 'NodeDistillationProcessor',
    schema: NodeDistillationProcessor.schema,
    create: (env, options) => NodeDistillationProcessor.create(env, options),
  });

  registry.registerProcessor<ToolMaskingProcessorOptions>({
    id: 'ToolMaskingProcessor',
    schema: ToolMaskingProcessor.schema,
    create: (env, options) => ToolMaskingProcessor.create(env, options),
  });

  registry.registerProcessor<StateSnapshotProcessorOptions>({
    id: 'StateSnapshotProcessor',
    schema: StateSnapshotProcessor.schema,
    create: (env, options) => StateSnapshotProcessor.create(env, options),
  });

  registry.registerWorker<StateSnapshotWorkerOptions>({
    id: 'StateSnapshotWorker',
    schema: StateSnapshotWorker.schema,
    create: (env, options) => StateSnapshotWorker.create(env, options),
  });

  registry.registerProcessor<RollingSummaryProcessorOptions>({
    id: 'RollingSummaryProcessor',
    schema: RollingSummaryProcessor.schema,
    create: (env, options) => RollingSummaryProcessor.create(env, options),
  });
}
