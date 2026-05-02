/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { GeminiChat } from '../core/geminiChat.js';
import { ContextProcessorRegistry } from './config/registry.js';
import { loadContextManagementConfig } from './config/configLoader.js';
import { ContextTracer } from './tracer.js';
import { ContextEventBus } from './eventBus.js';
import { ContextEnvironmentImpl } from './pipeline/environmentImpl.js';
import { PipelineOrchestrator } from './pipeline/orchestrator.js';
import { ContextManager } from './contextManager.js';
// import { debugLogger } from '../utils/debugLogger.js';
import { NodeTruncationProcessorOptionsSchema } from './processors/nodeTruncationProcessor.js';
import { ToolMaskingProcessorOptionsSchema } from './processors/toolMaskingProcessor.js';
import { HistoryTruncationProcessorOptionsSchema } from './processors/historyTruncationProcessor.js';
import { BlobDegradationProcessorOptionsSchema } from './processors/blobDegradationProcessor.js';
import { NodeDistillationProcessorOptionsSchema } from './processors/nodeDistillationProcessor.js';
import { StateSnapshotProcessorOptionsSchema } from './processors/stateSnapshotProcessor.js';
import { StateSnapshotAsyncProcessorOptionsSchema } from './processors/stateSnapshotAsyncProcessor.js';
import { RollingSummaryProcessorOptionsSchema } from './processors/rollingSummaryProcessor.js';
import { getEnvironmentContext } from '../utils/environmentContext.js';

export async function initializeContextManager(
  config: Config,
  chat: GeminiChat,
  lastPromptId: string,
): Promise<ContextManager | undefined> {
  const isV1Enabled = config.getContextManagementConfig().enabled;
  if (!isV1Enabled) {
    return undefined;
  }

  const registry = new ContextProcessorRegistry();
  registry.registerProcessor({
    id: 'NodeTruncationProcessor',
    schema: NodeTruncationProcessorOptionsSchema,
  });
  registry.registerProcessor({
    id: 'ToolMaskingProcessor',
    schema: ToolMaskingProcessorOptionsSchema,
  });
  registry.registerProcessor({
    id: 'HistoryTruncationProcessor',
    schema: HistoryTruncationProcessorOptionsSchema,
  });
  registry.registerProcessor({
    id: 'BlobDegradationProcessor',
    schema: BlobDegradationProcessorOptionsSchema,
  });
  registry.registerProcessor({
    id: 'NodeDistillationProcessor',
    schema: NodeDistillationProcessorOptionsSchema,
  });
  registry.registerProcessor({
    id: 'StateSnapshotProcessor',
    schema: StateSnapshotProcessorOptionsSchema,
  });
  registry.registerProcessor({
    id: 'StateSnapshotAsyncProcessor',
    schema: StateSnapshotAsyncProcessorOptionsSchema,
  });
  registry.registerProcessor({
    id: 'RollingSummaryProcessor',
    schema: RollingSummaryProcessorOptionsSchema,
  });

  const sidecarProfile = await loadContextManagementConfig(
    config.getExperimentalContextManagementConfig(),
    registry,
  );

  const storage = config.storage;
  const logDir = storage.getProjectTempLogsDir();
  const projectTempDir = storage.getProjectTempDir();

  const tracer = new ContextTracer({
    enabled: !!process.env['GEMINI_CONTEXT_TRACE_DIR'],
    targetDir: projectTempDir,
    sessionId: lastPromptId,
  });

  const eventBus = new ContextEventBus();

  const env = new ContextEnvironmentImpl(
    () => config.getBaseLlmClient(),
    config.getSessionId(),
    lastPromptId,
    logDir,
    projectTempDir,
    tracer,
    4,
    eventBus,
  );

  const orchestrator = new PipelineOrchestrator(
    sidecarProfile.buildPipelines(env),
    sidecarProfile.buildAsyncPipelines(env),
    env,
    eventBus,
    tracer,
  );

  return new ContextManager(
    sidecarProfile,
    env,
    tracer,
    orchestrator,
    chat.agentHistory,
    async () => {
      const parts = await getEnvironmentContext(config);
      return { role: 'user', parts };
    },
  );
}
