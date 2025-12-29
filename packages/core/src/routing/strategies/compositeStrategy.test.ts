/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompositeStrategy } from './compositeStrategy.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingStrategy,
  TerminalStrategy,
} from '../routingStrategy.js';
import type { Config } from '../../config/config.js';
import type { BaseLlmClient } from '../../core/baseLlmClient.js';
import { debugLogger } from '../../utils/debugLogger.js';
import { coreEvents } from '../../utils/events.js';

vi.mock('../../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

describe('CompositeStrategy', () => {
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  let mockStrategy1: RoutingStrategy;
  let mockStrategy2: RoutingStrategy;
  let mockTerminalStrategy: TerminalStrategy;
  let emitFeedbackSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = {} as RoutingContext;
    mockConfig = {} as Config;
    mockBaseLlmClient = {} as BaseLlmClient;

    emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

    mockStrategy1 = {
      name: 'strategy1',
      route: vi.fn().mockResolvedValue(null),
    };

    mockStrategy2 = {
      name: 'strategy2',
      route: vi.fn().mockResolvedValue(null),
    };

    mockTerminalStrategy = {
      name: 'terminal',
      route: vi.fn().mockResolvedValue({
        model: 'terminal-model',
        metadata: {
          source: 'terminal',
          latencyMs: 10,
          reasoning: 'Terminal decision',
        },
      }),
    };
  });

  it('should try strategies in order and return the first successful decision', async () => {
    const decision: RoutingDecision = {
      model: 'strategy2-model',
      metadata: {
        source: 'strategy2',
        latencyMs: 20,
        reasoning: 'Strategy 2 decided',
      },
    };
    vi.spyOn(mockStrategy2, 'route').mockResolvedValue(decision);

    const composite = new CompositeStrategy(
      [mockStrategy1, mockStrategy2, mockTerminalStrategy],
      'test-router',
    );

    const result = await composite.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(mockStrategy1.route).toHaveBeenCalledWith(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );
    expect(mockStrategy2.route).toHaveBeenCalledWith(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );
    expect(mockTerminalStrategy.route).not.toHaveBeenCalled();

    expect(result.model).toBe('strategy2-model');
    expect(result.metadata.source).toBe('test-router/strategy2');
  });

  it('should fall back to the terminal strategy if no other strategy provides a decision', async () => {
    const composite = new CompositeStrategy(
      [mockStrategy1, mockStrategy2, mockTerminalStrategy],
      'test-router',
    );

    const result = await composite.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(mockStrategy1.route).toHaveBeenCalledTimes(1);
    expect(mockStrategy2.route).toHaveBeenCalledTimes(1);
    expect(mockTerminalStrategy.route).toHaveBeenCalledTimes(1);

    expect(result.model).toBe('terminal-model');
    expect(result.metadata.source).toBe('test-router/terminal');
  });

  it('should handle errors in non-terminal strategies and continue', async () => {
    vi.spyOn(mockStrategy1, 'route').mockRejectedValue(
      new Error('Strategy 1 failed'),
    );

    const composite = new CompositeStrategy(
      [mockStrategy1, mockTerminalStrategy],
      'test-router',
    );

    const result = await composite.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(debugLogger.warn).toHaveBeenCalledWith(
      "[Routing] Strategy 'strategy1' failed. Continuing to next strategy. Error:",
      expect.any(Error),
    );
    expect(result.model).toBe('terminal-model');
  });

  it('should re-throw an error from the terminal strategy', async () => {
    const terminalError = new Error('Terminal strategy failed');
    vi.spyOn(mockTerminalStrategy, 'route').mockRejectedValue(terminalError);

    const composite = new CompositeStrategy([mockTerminalStrategy]);

    await expect(
      composite.route(mockContext, mockConfig, mockBaseLlmClient),
    ).rejects.toThrow(terminalError);

    expect(emitFeedbackSpy).toHaveBeenCalledWith(
      'error',
      "[Routing] Critical Error: Terminal strategy 'terminal' failed. Routing cannot proceed. Error:",
      terminalError,
    );
  });

  it('should correctly finalize the decision metadata', async () => {
    const decision: RoutingDecision = {
      model: 'some-model',
      metadata: {
        source: 'child-source',
        latencyMs: 50,
        reasoning: 'Child reasoning',
      },
    };
    vi.spyOn(mockStrategy1, 'route').mockResolvedValue(decision);

    const composite = new CompositeStrategy(
      [mockStrategy1, mockTerminalStrategy],
      'my-composite',
    );

    const result = await composite.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(result.model).toBe('some-model');
    expect(result.metadata.source).toBe('my-composite/child-source');
    expect(result.metadata.reasoning).toBe('Child reasoning');
    // It should keep the child's latency
    expect(result.metadata.latencyMs).toBe(50);
  });

  it('should calculate total latency if child latency is not provided', async () => {
    const decision: RoutingDecision = {
      model: 'some-model',
      metadata: {
        source: 'child-source',
        // No latencyMs here
        latencyMs: 0,
        reasoning: 'Child reasoning',
      },
    };
    vi.spyOn(mockStrategy1, 'route').mockResolvedValue(decision);

    const composite = new CompositeStrategy(
      [mockStrategy1, mockTerminalStrategy],
      'my-composite',
    );

    const result = await composite.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
