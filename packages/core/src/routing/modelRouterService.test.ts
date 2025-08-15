/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRouterService } from './modelRouterService.js';
import { Config } from '../config/config.js';
import { GeminiClient } from '../core/client.js';
import {
  RoutingContext,
  RoutingStrategy,
  RoutingDecision,
} from './routingStrategy.js';
import { ClassifierStrategy } from './strategies/classifierStrategy.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { logModelRouting } from '../telemetry/loggers.js';

vi.mock('../config/config.js');
vi.mock('../core/client.js');
vi.mock('./strategies/classifierStrategy.js');
vi.mock('../telemetry/loggers.js');

describe('ModelRouterService', () => {
  let service: ModelRouterService;
  let mockConfig: Config;
  let mockClient: GeminiClient;
  let mockStrategy: RoutingStrategy;
  let mockContext: RoutingContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = new Config({} as never);
    mockClient = new GeminiClient(mockConfig);

    mockStrategy = new ClassifierStrategy();
    vi.mocked(ClassifierStrategy).mockImplementation(
      () => mockStrategy as ClassifierStrategy,
    );

    service = new ModelRouterService(mockConfig);

    mockContext = {
      history: [],
      request: [{ text: 'test prompt' }],
      promptId: 'test-prompt-id',
      signal: new AbortController().signal,
    };
  });

  it('should initialize with ClassifierStrategy by default', () => {
    expect(ClassifierStrategy).toHaveBeenCalled();
    expect(service['strategy']).toBeInstanceOf(ClassifierStrategy);
  });

  describe('route()', () => {
    it('should bypass strategy and use forcedModel if provided', async () => {
      const forcedModel = 'forced-test-model';
      mockContext.forcedModel = forcedModel;

      const strategySpy = vi.spyOn(mockStrategy, 'route');

      const decision = await service.route(mockContext, mockClient);

      expect(strategySpy).not.toHaveBeenCalled();
      expect(decision.model).toBe(forcedModel);
      expect(decision.reason).toContain(
        'Routing bypassed by forced model directive',
      );
      expect(decision.metadata.source).toBe('Forced');

      expect(logModelRouting).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          decision_model: forcedModel,
          decision_source: 'Forced',
          failed: false,
        }),
      );
    });

    it('should delegate to the strategy when no override is present', async () => {
      const strategyDecision: RoutingDecision = {
        model: 'strategy-chosen-model',
        reason: 'Strategy reasoning',
        metadata: {
          source: 'Classifier',
          latencyMs: 100,
          reasoning: 'LLM reasoning',
        },
      };
      const strategySpy = vi
        .spyOn(mockStrategy, 'route')
        .mockResolvedValue(strategyDecision);

      const decision = await service.route(mockContext, mockClient);

      expect(strategySpy).toHaveBeenCalledWith(mockContext, mockClient);
      expect(decision).toEqual(strategyDecision);

      expect(logModelRouting).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          decision_model: 'strategy-chosen-model',
          decision_source: 'Classifier',
          routing_latency_ms: 100,
          classifier_reasoning: 'LLM reasoning',
          failed: false,
        }),
      );
    });

    it('should fallback to default model (Pro) if the strategy fails (throws error)', async () => {
      const error = new Error('Strategy failed due to network error');
      const strategySpy = vi
        .spyOn(mockStrategy, 'route')
        .mockRejectedValue(error);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const decision = await service.route(mockContext, mockClient);

      expect(strategySpy).toHaveBeenCalled();
      expect(decision.model).toBe(DEFAULT_GEMINI_MODEL);
      expect(decision.reason).toContain(
        'Failed to classify, defaulting to pro model',
      );
      expect(decision.metadata.source).toBe('Fallback');
      expect(decision.metadata.error).toBe(error.message);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'ClassifierStrategy failed: Strategy failed due to network error. Defaulting to pro model.',
        ),
      );

      expect(logModelRouting).toHaveBeenCalledWith(
        mockConfig,
        expect.objectContaining({
          decision_model: DEFAULT_GEMINI_MODEL,
          decision_source: 'Fallback',
          failed: true,
          error_message: error.message,
        }),
      );

      consoleSpy.mockRestore();
    });
  });
});
