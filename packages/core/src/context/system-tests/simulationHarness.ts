/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { ContextManager } from '../contextManager.js';
import { AgentChatHistory } from '../../core/agentChatHistory.js';
import type { Content } from '@google/genai';
import type { ContextProfile } from '../config/profiles.js';
import { ContextEnvironmentImpl } from '../pipeline/environmentImpl.js';
import { ContextTracer } from '../tracer.js';
import { ContextEventBus } from '../eventBus.js';
import { PipelineOrchestrator } from '../pipeline/orchestrator.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import { StaticTokenCalculator } from '../utils/contextTokenCalculator.js';
import { NodeBehaviorRegistry } from '../graph/behaviorRegistry.js';
import { registerBuiltInBehaviors } from '../graph/builtinBehaviors.js';

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
  config!: ContextProfile;
  private tracer!: ContextTracer;
  private currentTurnIndex = 0;
  private tokenTrajectory: TurnSummary[] = [];

  static async create(
    config: ContextProfile,
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
    config: ContextProfile,
    mockLlmClient: BaseLlmClient,
    mockTempDir: string,
  ) {
    this.config = config;

    this.tracer = new ContextTracer({
      targetDir: mockTempDir,
      sessionId: 'sim-session',
    });

    const behaviorRegistry = new NodeBehaviorRegistry();
    registerBuiltInBehaviors(behaviorRegistry);
    const calculator = new StaticTokenCalculator(1, behaviorRegistry);

    this.env = new ContextEnvironmentImpl(
      () => mockLlmClient,
      'sim-prompt',
      'sim-session',
      mockTempDir,
      mockTempDir,
      this.tracer,
      1, // 1 char per token average for estimation (but estimator uses 0.33)
      this.eventBus,
      calculator,
      behaviorRegistry,
    );

    this.orchestrator = new PipelineOrchestrator(
      config.buildPipelines(this.env),
      config.buildAsyncPipelines(this.env),
      this.env,
      this.eventBus,
      this.tracer,
    );
    this.contextManager = new ContextManager(
      config,
      this.env,
      this.tracer,
      this.orchestrator,
      this.chatHistory,
      calculator,
    );
  }

  async simulateTurn(messages: Content[]) {
    // 1. Append the new messages
    const currentHistory = this.chatHistory.get();
    const turns = messages.map((m) => ({ id: randomUUID(), content: m }));
    this.chatHistory.set([...currentHistory, ...turns]);

    // 2. Measure tokens immediately after append
    const tokensBefore = this.env.tokenCalculator.calculateConcreteListTokens(
      this.contextManager.getNodes(),
    );

    // 3. Yield to event loop and wait for async pipelines to finish
    await this.contextManager.waitForPipelines();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Extra beat for event bus propagation

    // 4. Measure tokens after background processors
    const tokensAfter = this.env.tokenCalculator.calculateConcreteListTokens(
      this.contextManager.getNodes(),
    );

    this.tokenTrajectory.push({
      turnIndex: this.currentTurnIndex++,
      tokensBeforeBackground: tokensBefore,
      tokensAfterBackground: tokensAfter,
    });
  }

  async getGoldenState() {
    const { history: finalProjection, baseUnits } =
      await this.contextManager.renderHistory();
    return {
      tokenTrajectory: this.tokenTrajectory,
      finalProjection,
      baseUnits,
    };
  }
}
