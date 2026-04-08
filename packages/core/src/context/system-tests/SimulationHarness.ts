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
import { PipelineOrchestrator } from '../sidecar/orchestrator.js';
import { registerBuiltInProcessors } from '../sidecar/builtins.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { ProcessorRegistry } from '../sidecar/registry.js';
import { DeterministicIdGenerator } from '../system/DeterministicIdGenerator.js';
import { InMemoryFileSystem } from '../system/InMemoryFileSystem.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';

export interface TurnSummary {
  turnIndex: number;
  tokensBeforeBackground: number;
  tokensAfterBackground: number;
}

export class SimulationHarness {
  readonly chatHistory: AgentChatHistory;
  contextManager!: ContextManager;
  env!: ContextEnvironmentImpl;
  orchestrator!: PipelineOrchestrator;
  readonly eventBus: ContextEventBus;
  config!: SidecarConfig;
  private tracer!: ContextTracer;
  private currentTurnIndex = 0;
  private tokenTrajectory: TurnSummary[] = [];

  static async create(
    config: SidecarConfig,
    mockLlmClient: BaseLlmClient,
    mockTempDir = '/tmp/sim',
  ): Promise<SimulationHarness> {
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
    mockLlmClient: BaseLlmClient,
    mockTempDir: string,
  ) {
    this.config = config;
    const registry = new ProcessorRegistry();
    // Register all standard processors
    registerBuiltInProcessors(registry);

    this.tracer = new ContextTracer({
      targetDir: mockTempDir,
      sessionId: 'sim-session',
    });
    this.env = new ContextEnvironmentImpl(
      mockLlmClient,
      'sim-prompt',
      'sim-session',
      mockTempDir,
      mockTempDir,
      this.tracer,
      4, // 4 chars per token average
      this.eventBus,
      new InMemoryFileSystem(),
      new DeterministicIdGenerator(),
    );

    this.orchestrator = new PipelineOrchestrator(
      config,
      this.env,
      this.eventBus,
      this.tracer,
      registry,
    );
    this.contextManager = ContextManager.create(
      config,
      this.env,
      this.tracer,
      this.orchestrator,
      registry,
    );
    this.contextManager.subscribeToHistory(this.chatHistory);
  }

  /**
   * Simulates a single "Turn" (User input + Model/Tool outputs)
   * A turn might consist of multiple Content messages (e.g. user prompt -> model call -> user response -> model answer)
   */
  async simulateTurn(messages: Content[]) {
    // 1. Append the new messages
    const currentHistory = this.chatHistory.get();
    this.chatHistory.set([...currentHistory, ...messages]);

    // 2. Measure tokens immediately after append (Before background processing)
    const tokensBefore = this.env.tokenCalculator.calculateConcreteListTokens(
      this.contextManager.getShip(),
    );
    debugLogger.log(
      `[Turn ${this.currentTurnIndex}] Tokens BEFORE: ${tokensBefore}`,
    );

    // 3. Yield to event loop to allow internal async subscribers and orchestrator to finish
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 3.1 Simulate what projectCompressedHistory does with the sync handlers
    let currentView = this.contextManager.getShip();
    const currentTokens =
      this.env.tokenCalculator.calculateConcreteListTokens(currentView);
    if (this.config.budget && currentTokens > this.config.budget.maxTokens) {
      debugLogger.log(
        `[Turn ${this.currentTurnIndex}] Sync panic triggered! ${currentTokens} > ${this.config.budget.maxTokens}`,
      );
      const orchestrator = this.orchestrator;
      // In the V2 simulation, we trigger the 'gc_backstop' to simulate emergency pressure.
      currentView = await orchestrator.executeTriggerSync(
        'gc_backstop',
        currentView,
        new Set(currentView.map(e => e.id)),
        new Set<string>(),
      );
      // Inject the truncated view back into the graph
      for (let i = 0; i < currentView.length; i++) {
        const ep = currentView[i];
        if (
          !this.contextManager
            .getShip()
            .find((c) => c.id === ep.id)
        ) {
          this.eventBus.emitVariantReady({
            targetId: ep.id,
            variantId: 'v-emergency',
            variant: {
              type: 'MASKED_TOOL',
              id: 'mock-id',
              tokens: { intent: 0, observation: 0 },
              intent: {}, observation: {}, toolName: 'tool',
            },
          });
        }
      }
      // Wait for variant propagation
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // 4. Measure tokens after background processors have (hopefully) emitted variants
    const tokensAfter = this.env.tokenCalculator.calculateConcreteListTokens(
      this.contextManager.getShip(),
    );
    debugLogger.log(
      `[Turn ${this.currentTurnIndex}] Tokens AFTER: ${tokensAfter}`,
    );

    this.tokenTrajectory.push({
      turnIndex: this.currentTurnIndex++,
      tokensBeforeBackground: tokensBefore,
      tokensAfterBackground: tokensAfter,
    });
  }

  async getGoldenState() {
    const finalProjection =
      await this.contextManager.projectCompressedHistory();
    return {
      tokenTrajectory: this.tokenTrajectory,
      finalProjection,
    };
  }
}
