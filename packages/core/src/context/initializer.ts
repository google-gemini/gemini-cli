import type { Config } from '../config/config.js';
import type { GeminiChat } from '../core/geminiChat.js';

export async function initializeContextManager(
  config: Config,
  chat: GeminiChat,
  lastPromptId: string,
): Promise<any> {

  const isV1Enabled = config.getContextManagementConfig().enabled;
  const isExperiment = config.getExperimentalContextManagementConfig() === 'generalistProfile';

  if (!isV1Enabled && !isExperiment) {
    return;
  }


  const { ContextProcessorRegistry } = await import('./config/registry.js');
  const { loadContextManagementConfig } = await import('./config/configLoader.js');
  const { ContextTracer } = await import('./tracer.js');
  const { ContextEventBus } = await import('./eventBus.js');
  const { ContextEnvironmentImpl } = await import('./pipeline/environmentImpl.js');
  const { PipelineOrchestrator } = await import('./pipeline/orchestrator.js');
  const { ContextManager } = await import('./contextManager.js');

  const { NodeTruncationProcessorOptionsSchema } = await import('./processors/nodeTruncationProcessor.js');
  const { ToolMaskingProcessorOptionsSchema } = await import('./processors/toolMaskingProcessor.js');
  const { HistoryTruncationProcessorOptionsSchema } = await import('./processors/historyTruncationProcessor.js');
  const { BlobDegradationProcessorOptionsSchema } = await import('./processors/blobDegradationProcessor.js');
  const { NodeDistillationProcessorOptionsSchema } = await import('./processors/nodeDistillationProcessor.js');
  const { StateSnapshotProcessorOptionsSchema } = await import('./processors/stateSnapshotProcessor.js');
  const { StateSnapshotAsyncProcessorOptionsSchema } = await import('./processors/stateSnapshotAsyncProcessor.js');
  const { RollingSummaryProcessorOptionsSchema } = await import('./processors/rollingSummaryProcessor.js');

  const registry = new ContextProcessorRegistry();
  registry.registerProcessor({ id: 'NodeTruncationProcessor', schema: NodeTruncationProcessorOptionsSchema });
  registry.registerProcessor({ id: 'ToolMaskingProcessor', schema: ToolMaskingProcessorOptionsSchema });
  registry.registerProcessor({ id: 'HistoryTruncationProcessor', schema: HistoryTruncationProcessorOptionsSchema });
  registry.registerProcessor({ id: 'BlobDegradationProcessor', schema: BlobDegradationProcessorOptionsSchema });
  registry.registerProcessor({ id: 'NodeDistillationProcessor', schema: NodeDistillationProcessorOptionsSchema });
  registry.registerProcessor({ id: 'StateSnapshotProcessor', schema: StateSnapshotProcessorOptionsSchema });
  registry.registerProcessor({ id: 'StateSnapshotAsyncProcessor', schema: StateSnapshotAsyncProcessorOptionsSchema });
  registry.registerProcessor({ id: 'RollingSummaryProcessor', schema: RollingSummaryProcessorOptionsSchema });

  const sidecarProfile = await loadContextManagementConfig(config.getExperimentalContextManagementConfig(), registry);

  const storage = config.storage;
  const logDir = storage.getProjectTempLogsDir();
  const projectTempDir = storage.getProjectTempDir();

  const tracer = new ContextTracer({
    targetDir: logDir,
    sessionId: lastPromptId,
  });

  const eventBus = new ContextEventBus();

  const env = new ContextEnvironmentImpl(
    config.getBaseLlmClient(),
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
  );
}
