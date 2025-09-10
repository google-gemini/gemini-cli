/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRouterService } from './modelRouterService.js';
import { Config } from '../config/config.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
} from './routingStrategy.js';
import { DefaultStrategy } from './strategies/defaultStrategy.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';

// Mock the dependencies
vi.mock('../config/config.js');
vi.mock('../core/baseLlmClient.js');
vi.mock('./strategies/defaultStrategy.js');

describe('ModelRouterService', () => {
  let service: ModelRouterService;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  let mockStrategy: RoutingStrategy;
  let mockContext: RoutingContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock instances
    mockConfig = new Config({} as never);
    mockBaseLlmClient = {} as BaseLlmClient;
    vi.spyOn(mockConfig, 'getBaseLlmClient').mockReturnValue(mockBaseLlmClient);

    // Mock the strategy that the service will instantiate
    mockStrategy = new DefaultStrategy();
    vi.mocked(DefaultStrategy).mockImplementation(() => mockStrategy);

    // Instantiate the service to be tested
    service = new ModelRouterService(mockConfig);

    // Create a default context for tests
    mockContext = {
      history: [],
      request: [{ text: 'test prompt' }],
      signal: new AbortController().signal,
    };
  });

  it('should initialize with DefaultStrategy by default', () => {
    expect(DefaultStrategy).toHaveBeenCalled();
    expect(service['strategy']).toBeInstanceOf(DefaultStrategy);
  });

  describe('route()', () => {
    it('should return the Flash model if in fallback mode', async () => {
      vi.spyOn(mockConfig, 'isInFallbackMode').mockReturnValue(true);
      const strategySpy = vi.spyOn(mockStrategy, 'route');

      const decision = await service.route(mockContext);

      expect(strategySpy).not.toHaveBeenCalled();
      expect(decision.model).toBe(DEFAULT_GEMINI_FLASH_MODEL);
      expect(decision.reason).toContain('In fallback mode');
      expect(decision.metadata.source).toBe('Fallback');
    });

    it('should bypass strategy and use explicitModel if provided', async () => {
      vi.spyOn(mockConfig, 'isInFallbackMode').mockReturnValue(false);
      const explicitModel = 'explicit-test-model';
      mockContext.explicitModel = explicitModel;

      const strategySpy = vi.spyOn(mockStrategy, 'route');

      const decision = await service.route(mockContext);

      expect(strategySpy).not.toHaveBeenCalled();
      expect(decision.model).toBe(explicitModel);
      expect(decision.reason).toContain(
        'Routing bypassed by forced model directive',
      );
      expect(decision.metadata.source).toBe('Explicit');
    });

    it('should delegate to the strategy when no override is present', async () => {
      vi.spyOn(mockConfig, 'isInFallbackMode').mockReturnValue(false);
      const strategyDecision: RoutingDecision = {
        model: 'strategy-chosen-model',
        reason: 'Strategy reasoning',
        metadata: {
          source: 'Default',
          latencyMs: 0,
        },
      };
      const strategySpy = vi
        .spyOn(mockStrategy, 'route')
        .mockResolvedValue(strategyDecision);

      const decision = await service.route(mockContext);

      expect(strategySpy).toHaveBeenCalledWith(mockContext, mockBaseLlmClient);
      expect(decision).toEqual(strategyDecision);
    });
  });
});
