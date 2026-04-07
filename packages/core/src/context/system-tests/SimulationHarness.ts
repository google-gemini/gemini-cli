/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextManager } from '../contextManager.js';
import { AgentChatHistory } from '../../core/agentChatHistory.js';
import type { Content } from '@google/genai';
import type { SidecarConfig } from '../sidecar/types.js';
import { ContextEnvironmentImpl } from '../sidecar/environmentImpl.js';
import { ContextTracer } from '../tracer.js';
import { ContextEventBus } from '../eventBus.js';

import { BlobDegradationProcessor } from '../processors/blobDegradationProcessor.js';
import { ToolMaskingProcessor } from '../processors/toolMaskingProcessor.js';
import { HistorySquashingProcessor } from '../processors/historySquashingProcessor.js';
import { SemanticCompressionProcessor } from '../processors/semanticCompressionProcessor.js';
import { StateSnapshotProcessor } from '../processors/stateSnapshotProcessor.js';
import { EmergencyTruncationProcessor } from '../processors/emergencyTruncationProcessor.js';
import { ProcessorRegistry } from '../sidecar/registry.js';

export interface TurnSummary {
  turnIndex: number;
  tokensBeforeBackground: number;
  tokensAfterBackground: number;
}

export class SimulationHarness {
  readonly chatHistory: AgentChatHistory;
  contextManager!: ContextManager;
  readonly eventBus: ContextEventBus;
  config!: SidecarConfig;
  private tracer!: ContextTracer;
  private currentTurnIndex = 0;
  private tokenTrajectory: TurnSummary[] = [];

  static async create(config: SidecarConfig, mockLlmClient: any, mockTempDir = '/tmp/sim'): Promise<SimulationHarness> {
    const harness = new SimulationHarness();
    await harness.init(config, mockLlmClient, mockTempDir);
    return harness;
  }

  private constructor() {
    this.chatHistory = new AgentChatHistory();
    this.eventBus = new ContextEventBus();
  }

  private async init(
    config: SidecarConfig,
    mockLlmClient: any,
    mockTempDir: string
  ) {
    this.config = config;
    // Register all standard processors
    ProcessorRegistry.register({ id: 'BlobDegradationProcessor', create: (env, opts) => new BlobDegradationProcessor(env) });
    ProcessorRegistry.register({ id: 'ToolMaskingProcessor', create: (env, opts) => new ToolMaskingProcessor(env, opts) });
    ProcessorRegistry.register({ id: 'HistorySquashingProcessor', create: (env, opts) => new HistorySquashingProcessor(env, opts) });
    ProcessorRegistry.register({ id: 'SemanticCompressionProcessor', create: (env, opts) => new SemanticCompressionProcessor(env, opts) });
    ProcessorRegistry.register({ id: 'StateSnapshotProcessor', create: (env, opts) => new StateSnapshotProcessor(env, opts, env.eventBus) });
    ProcessorRegistry.register({ id: 'EmergencyTruncationProcessor', create: (env, opts) => new EmergencyTruncationProcessor(env, opts) });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    (this as any).tracer = new ContextTracer({ targetDir: mockTempDir, sessionId: 'sim-session' });

    // Using real token calculator instead of mock, so we test actual string sizes
    const InMemoryFS = (await import('../system/InMemoryFileSystem.js')).InMemoryFileSystem;
    const DetIdGen = (await import('../system/DeterministicIdGenerator.js')).DeterministicIdGenerator;

    const env = new ContextEnvironmentImpl(
      mockLlmClient,
      'sim-prompt',
      'sim-session',
      mockTempDir,
      mockTempDir,
      this.tracer,
      4, // 4 chars per token average
      this.eventBus,
      new InMemoryFS(),
      new DetIdGen()
    );

    this.contextManager = new ContextManager(config, env, this.tracer);
    this.contextManager.subscribeToHistory(this.chatHistory);
  }

  /**
   * Simulates a single "Turn" (User input + Model/Tool outputs)
   * A turn might consist of multiple Content messages (e.g. user prompt -> model call -> user response -> model answer)
   */
  async simulateTurn(messages: Content[]) {
    // 1. Append the new messages
    const currentHistory = this.chatHistory.get();
    await this.chatHistory.set([...currentHistory, ...messages]);
    
    // 2. Measure tokens immediately after append (Before background processing)
    const tokensBefore = (this.contextManager as any).env.tokenCalculator.calculateEpisodeListTokens(
      this.contextManager.getWorkingBufferView()
    );
    console.log(`[Turn ${this.currentTurnIndex}] Tokens BEFORE: ${tokensBefore}`);
    
    // 3. Yield to event loop to allow internal async subscribers and orchestrator to finish
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // 3.1 Simulate what projectCompressedHistory does with the sync handlers
    let currentView = this.contextManager.getWorkingBufferView();
    const currentTokens = (this.contextManager as any).env.tokenCalculator.calculateEpisodeListTokens(currentView);
    if (this.config.budget && currentTokens > this.config.budget.maxTokens) {
      console.log(`[Turn ${this.currentTurnIndex}] Sync panic triggered! ${currentTokens} > ${this.config.budget.maxTokens}`);
      const syncPipelines = this.config.pipelines.filter(p => p.execution === 'blocking');
      const orchestrator = (this.contextManager as any).orchestrator;
      for (const pipe of syncPipelines) {
         currentView = await orchestrator.executePipeline(pipe.name, currentView, {
            currentTokens,
            maxTokens: this.config.budget.maxTokens,
            retainedTokens: this.config.budget.retainedTokens,
            deficitTokens: currentTokens - this.config.budget.maxTokens,
            protectedEpisodeIds: new Set()
         });
      }
      
      // Inject the truncated view back into the graph
      for (let i = 0; i < currentView.length; i++) {
          const ep = currentView[i];
          if (!this.contextManager.getWorkingBufferView().find(c => c.id === ep.id)) {
               this.eventBus.emitVariantReady({
                  targetId: ep.id,
                  variantId: 'v-emergency',
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
                  variant: {
                      status: 'ready',
                      type: 'masked', // Truncation is technically a mask
                      text: ep.yield?.text || '',
                      recoveredTokens: 0,
                  } as any
              });
          }
      }
      // Wait for variant propagation
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // 4. Measure tokens after background processors have (hopefully) emitted variants
    const tokensAfter = (this.contextManager as any).env.tokenCalculator.calculateEpisodeListTokens(
      this.contextManager.getWorkingBufferView()
    );
    console.log(`[Turn ${this.currentTurnIndex}] Tokens AFTER: ${tokensAfter}`);
    
    this.tokenTrajectory.push({
      turnIndex: this.currentTurnIndex++,
      tokensBeforeBackground: tokensBefore,
      tokensAfterBackground: tokensAfter,
    });
  }

  async getGoldenState() {
    const finalProjection = await this.contextManager.projectCompressedHistory();
    return {
      tokenTrajectory: this.tokenTrajectory,
      finalProjection
    };
  }
}
