/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRouterService } from './modelRouterService.js';
import { Config } from '../config/config.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { RoutingContext, RoutingDecision } from './routingStrategy.js';
import { DefaultStrategy } from './strategies/defaultStrategy.js';
import { CompositeStrategy } from './strategies/compositeStrategy.js';
import { FallbackStrategy } from './strategies/fallbackStrategy.js';
import { OverrideStrategy } from './strategies/overrideStrategy.js';

vi.mock('../config/config.js');
vi.mock('../core/baseLlmClient.js');
vi.mock('./strategies/defaultStrategy.js');
vi.mock('./strategies/compositeStrategy.js');
vi.mock('./strategies/fallbackStrategy.js');
vi.mock('./strategies/overrideStrategy.js');

describe('ModelRouterService', () => {
  let service: ModelRouterService;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  let mockContext: RoutingContext;
  let mockCompositeStrategy: CompositeStrategy;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = new Config({} as never);
    mockBaseLlmClient = {} as BaseLlmClient;
    vi.spyOn(mockConfig, 'getBaseLlmClient').mockReturnValue(mockBaseLlmClient);

    mockCompositeStrategy = new CompositeStrategy(
      [new FallbackStrategy(), new OverrideStrategy(), new DefaultStrategy()],
      'agent-router',
    );
    vi.mocked(CompositeStrategy).mockImplementation(
      () => mockCompositeStrategy,
    );

    service = new ModelRouterService(mockConfig);

    mockContext = {
      history: [],
      request: [{ text: 'test prompt' }],
      signal: new AbortController().signal,
    };
  });

  it('should initialize with a CompositeStrategy', () => {
    expect(CompositeStrategy).toHaveBeenCalled();
    expect(service['strategy']).toBeInstanceOf(CompositeStrategy);
  });

  it('should initialize the CompositeStrategy with the correct child strategies in order', () => {
    // This test relies on the mock implementation detail of the constructor
    const compositeStrategyArgs = vi.mocked(CompositeStrategy).mock.calls[0];
    const childStrategies = compositeStrategyArgs[0];

    expect(childStrategies.length).toBe(3);
    expect(childStrategies[0]).toBeInstanceOf(FallbackStrategy);
    expect(childStrategies[1]).toBeInstanceOf(OverrideStrategy);
    expect(childStrategies[2]).toBeInstanceOf(DefaultStrategy);
    expect(compositeStrategyArgs[1]).toBe('agent-router');
  });

  describe('route()', () => {
    it('should delegate routing to the composite strategy', async () => {
      const strategyDecision: RoutingDecision = {
        model: 'strategy-chosen-model',
        metadata: {
          source: 'test-router/fallback',
          latencyMs: 10,
          reasoning: 'Strategy reasoning',
        },
      };
      const strategySpy = vi
        .spyOn(mockCompositeStrategy, 'route')
        .mockResolvedValue(strategyDecision);

      const decision = await service.route(mockContext);

      expect(strategySpy).toHaveBeenCalledWith(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );
      expect(decision).toEqual(strategyDecision);
    });
  });
});
