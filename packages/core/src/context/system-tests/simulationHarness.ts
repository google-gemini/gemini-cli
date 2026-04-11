/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContextManager } from '../contextManager.js';
import { AgentChatHistory } from '../../core/agentChatHistory.js';
import type { Content } from '@google/genai';
import type { ContextProfile } from '../config/profiles.js';
import { ContextEnvironmentImpl } from '../pipeline/environmentImpl.js';
import { ContextTracer } from '../tracer.js';
import { debugLogger } from '../../utils/debugLogger.js';
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
    this.env = new ContextEnvironmentImpl(
      mockLlmClient,
      'sim-prompt',
      'sim-session',
      mockTempDir,
      mockTempDir,
      this.tracer,
      1, // 1 char per token average
      new InMemoryFileSystem(),
      new DeterministicIdGenerator(),
    );

    this.contextManager = new ContextManager(
      config,
      this.env,
      this.tracer,
      this.chatHistory,
    );
  }

  async simulateTurn(messages: Content[]) {
    const currentHistory = this.chatHistory.get();
    this.chatHistory.set([...currentHistory, ...messages]);

    const tokensBefore = this.env.tokenCalculator.calculateConcreteListTokens(
      this.contextManager.getNodes(),
    );
    debugLogger.log(
      `[Turn ${this.currentTurnIndex}] Tokens BEFORE: ${tokensBefore}`,
    );

    // Yield to let internal event loops settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    let currentView = this.contextManager.getNodes();
    const currentTokens =
      this.env.tokenCalculator.calculateConcreteListTokens(currentView);
    if (
      this.config.config.budget &&
      currentTokens > this.config.config.budget.maxTokens
    ) {
      debugLogger.log(
        `[Turn ${this.currentTurnIndex}] Sync panic triggered! ${currentTokens} > ${this.config.config.budget.maxTokens}`,
      );
      
      const modifiedView = await this.contextManager.executeTriggerSync(
        'gc_backstop',
        currentView,
        new Set(currentView.map((e) => e.id)),
        new Set<string>(),
      );

      currentView = modifiedView;
    }

    const tokensAfter = this.env.tokenCalculator.calculateConcreteListTokens(
      this.contextManager.getNodes(),
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
