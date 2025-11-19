/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  RoutingDecision,
  RoutingContext,
  RoutingStrategy,
  TerminalStrategy,
} from './routingStrategy.js';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import type { Config } from '../config/config.js';
import type { Content, PartListUnion } from '@google/genai';

describe('routingStrategy types', () => {
  describe('RoutingDecision', () => {
    it('should define valid RoutingDecision structure', () => {
      const decision: RoutingDecision = {
        model: 'gemini-2.5-pro',
        metadata: {
          source: 'test-strategy',
          latencyMs: 100,
          reasoning: 'Selected Pro model for complex task',
        },
      };

      expect(decision.model).toBe('gemini-2.5-pro');
      expect(decision.metadata.source).toBe('test-strategy');
      expect(decision.metadata.latencyMs).toBe(100);
      expect(decision.metadata.reasoning).toBe(
        'Selected Pro model for complex task',
      );
    });

    it('should allow error in metadata', () => {
      const decision: RoutingDecision = {
        model: 'gemini-2.0-flash',
        metadata: {
          source: 'fallback-strategy',
          latencyMs: 50,
          reasoning: 'Fallback to Flash due to error',
          error: 'Pro model unavailable',
        },
      };

      expect(decision.metadata.error).toBe('Pro model unavailable');
    });

    it('should support different model identifiers', () => {
      const decision1: RoutingDecision = {
        model: 'gemini-2.5-pro',
        metadata: { source: 'test', latencyMs: 0, reasoning: '' },
      };

      const decision2: RoutingDecision = {
        model: 'gemini-2.0-flash',
        metadata: { source: 'test', latencyMs: 0, reasoning: '' },
      };

      const decision3: RoutingDecision = {
        model: 'gemini-2.5-preview',
        metadata: { source: 'test', latencyMs: 0, reasoning: '' },
      };

      expect(decision1.model).toBe('gemini-2.5-pro');
      expect(decision2.model).toBe('gemini-2.0-flash');
      expect(decision3.model).toBe('gemini-2.5-preview');
    });

    it('should support various latency values', () => {
      const decision1: RoutingDecision = {
        model: 'model',
        metadata: { source: 'test', latencyMs: 0, reasoning: '' },
      };

      const decision2: RoutingDecision = {
        model: 'model',
        metadata: { source: 'test', latencyMs: 1500, reasoning: '' },
      };

      const decision3: RoutingDecision = {
        model: 'model',
        metadata: { source: 'test', latencyMs: 0.5, reasoning: '' },
      };

      expect(decision1.metadata.latencyMs).toBe(0);
      expect(decision2.metadata.latencyMs).toBe(1500);
      expect(decision3.metadata.latencyMs).toBe(0.5);
    });

    it('should support various reasoning strings', () => {
      const decision: RoutingDecision = {
        model: 'model',
        metadata: {
          source: 'composite',
          latencyMs: 100,
          reasoning:
            'Evaluated 3 strategies, selected Pro based on conversation complexity',
        },
      };

      expect(decision.metadata.reasoning).toContain('3 strategies');
    });
  });

  describe('RoutingContext', () => {
    it('should define valid RoutingContext structure', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there!' }] },
      ];

      const request: PartListUnion = [{ text: 'How are you?' }];

      const abortController = new AbortController();

      const context: RoutingContext = {
        history,
        request,
        signal: abortController.signal,
      };

      expect(context.history).toHaveLength(2);
      expect(context.request).toHaveLength(1);
      expect(context.signal).toBe(abortController.signal);
    });

    it('should support empty history', () => {
      const context: RoutingContext = {
        history: [],
        request: [{ text: 'First message' }],
        signal: new AbortController().signal,
      };

      expect(context.history).toHaveLength(0);
    });

    it('should support multiple request parts', () => {
      const context: RoutingContext = {
        history: [],
        request: [{ text: 'Part 1' }, { text: 'Part 2' }, { text: 'Part 3' }],
        signal: new AbortController().signal,
      };

      expect(context.request).toHaveLength(3);
    });

    it('should support complex history', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Q1' }] },
        { role: 'model', parts: [{ text: 'A1' }] },
        { role: 'user', parts: [{ text: 'Q2' }] },
        { role: 'model', parts: [{ text: 'A2' }] },
      ];

      const context: RoutingContext = {
        history,
        request: [{ text: 'Q3' }],
        signal: new AbortController().signal,
      };

      expect(context.history).toHaveLength(4);
    });

    it('should use AbortSignal correctly', () => {
      const abortController = new AbortController();
      const context: RoutingContext = {
        history: [],
        request: [{ text: 'test' }],
        signal: abortController.signal,
      };

      expect(context.signal.aborted).toBe(false);

      abortController.abort();

      expect(context.signal.aborted).toBe(true);
    });
  });

  describe('RoutingStrategy interface', () => {
    it('should implement basic routing strategy', async () => {
      const strategy: RoutingStrategy = {
        name: 'test-strategy',
        route: vi.fn().mockResolvedValue({
          model: 'gemini-2.5-pro',
          metadata: {
            source: 'test-strategy',
            latencyMs: 100,
            reasoning: 'Test reasoning',
          },
        }),
      };

      const mockContext: RoutingContext = {
        history: [],
        request: [{ text: 'test' }],
        signal: new AbortController().signal,
      };

      const decision = await strategy.route(
        mockContext,
        {} as Config,
        {} as BaseLlmClient,
      );

      expect(decision).toBeDefined();
      expect(decision?.model).toBe('gemini-2.5-pro');
    });

    it('should allow strategy to return null', async () => {
      const strategy: RoutingStrategy = {
        name: 'optional-strategy',
        route: vi.fn().mockResolvedValue(null),
      };

      const mockContext: RoutingContext = {
        history: [],
        request: [{ text: 'test' }],
        signal: new AbortController().signal,
      };

      const decision = await strategy.route(
        mockContext,
        {} as Config,
        {} as BaseLlmClient,
      );

      expect(decision).toBeNull();
    });

    it('should have readonly name property', () => {
      const strategy: RoutingStrategy = {
        name: 'immutable-name',
        route: vi.fn().mockResolvedValue(null),
      };

      expect(strategy.name).toBe('immutable-name');
    });

    it('should receive context in route method', async () => {
      const routeMock = vi.fn().mockResolvedValue(null);
      const strategy: RoutingStrategy = {
        name: 'test',
        route: routeMock,
      };

      const mockContext: RoutingContext = {
        history: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        request: [{ text: 'World' }],
        signal: new AbortController().signal,
      };

      await strategy.route(mockContext, {} as Config, {} as BaseLlmClient);

      expect(routeMock).toHaveBeenCalledWith(
        mockContext,
        expect.anything(),
        expect.anything(),
      );
    });

    it('should receive config in route method', async () => {
      const routeMock = vi.fn().mockResolvedValue(null);
      const strategy: RoutingStrategy = {
        name: 'test',
        route: routeMock,
      };

      const mockConfig = { getDebugMode: () => false } as unknown as Config;

      await strategy.route(
        {} as RoutingContext,
        mockConfig,
        {} as BaseLlmClient,
      );

      expect(routeMock).toHaveBeenCalledWith(
        expect.anything(),
        mockConfig,
        expect.anything(),
      );
    });

    it('should receive baseLlmClient in route method', async () => {
      const routeMock = vi.fn().mockResolvedValue(null);
      const strategy: RoutingStrategy = {
        name: 'test',
        route: routeMock,
      };

      const mockClient = {
        generateContent: vi.fn(),
      } as unknown as BaseLlmClient;

      await strategy.route({} as RoutingContext, {} as Config, mockClient);

      expect(routeMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        mockClient,
      );
    });
  });

  describe('TerminalStrategy interface', () => {
    it('should implement terminal routing strategy', async () => {
      const strategy: TerminalStrategy = {
        name: 'terminal-strategy',
        route: vi.fn().mockResolvedValue({
          model: 'gemini-2.0-flash',
          metadata: {
            source: 'terminal-strategy',
            latencyMs: 50,
            reasoning: 'Default fallback',
          },
        }),
      };

      const mockContext: RoutingContext = {
        history: [],
        request: [{ text: 'test' }],
        signal: new AbortController().signal,
      };

      const decision = await strategy.route(
        mockContext,
        {} as Config,
        {} as BaseLlmClient,
      );

      expect(decision).toBeDefined();
      expect(decision.model).toBe('gemini-2.0-flash');
    });

    it('should always return a decision (not null)', async () => {
      const strategy: TerminalStrategy = {
        name: 'guaranteed-strategy',
        route: vi.fn().mockResolvedValue({
          model: 'gemini-2.5-pro',
          metadata: {
            source: 'guaranteed',
            latencyMs: 0,
            reasoning: 'Always returns a decision',
          },
        }),
      };

      const decision = await strategy.route(
        {} as RoutingContext,
        {} as Config,
        {} as BaseLlmClient,
      );

      expect(decision).not.toBeNull();
      expect(decision.model).toBeDefined();
    });

    it('should be compatible with RoutingStrategy', () => {
      const terminalStrategy: TerminalStrategy = {
        name: 'terminal',
        route: vi.fn().mockResolvedValue({
          model: 'model',
          metadata: {
            source: 'terminal',
            latencyMs: 0,
            reasoning: '',
          },
        }),
      };

      const routingStrategy: RoutingStrategy = terminalStrategy;

      expect(routingStrategy.name).toBe('terminal');
    });

    it('should guarantee non-null return type', async () => {
      const strategy: TerminalStrategy = {
        name: 'always-decides',
        route: async () => ({
          model: 'fallback-model',
          metadata: {
            source: 'always-decides',
            latencyMs: 1,
            reasoning: 'Guaranteed decision',
          },
        }),
      };

      const decision = await strategy.route(
        {} as RoutingContext,
        {} as Config,
        {} as BaseLlmClient,
      );

      expect(decision).toBeDefined();
      expect(decision).not.toBeNull();
    });
  });

  describe('strategy naming', () => {
    it('should support various strategy names', () => {
      const strategies: RoutingStrategy[] = [
        { name: 'fallback', route: vi.fn() },
        { name: 'override', route: vi.fn() },
        { name: 'composite', route: vi.fn() },
        { name: 'complexity-based', route: vi.fn() },
        { name: 'cost-optimized', route: vi.fn() },
      ];

      expect(strategies[0]?.name).toBe('fallback');
      expect(strategies[1]?.name).toBe('override');
      expect(strategies[2]?.name).toBe('composite');
      expect(strategies[3]?.name).toBe('complexity-based');
      expect(strategies[4]?.name).toBe('cost-optimized');
    });
  });

  describe('async routing behavior', () => {
    it('should support delayed routing decisions', async () => {
      const strategy: RoutingStrategy = {
        name: 'delayed',
        route: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return {
            model: 'gemini-2.5-pro',
            metadata: {
              source: 'delayed',
              latencyMs: 10,
              reasoning: 'Simulated API call',
            },
          };
        },
      };

      const decision = await strategy.route(
        {} as RoutingContext,
        {} as Config,
        {} as BaseLlmClient,
      );

      expect(decision?.model).toBe('gemini-2.5-pro');
    });

    it('should support error handling in route', async () => {
      const strategy: RoutingStrategy = {
        name: 'error-prone',
        route: async () => {
          throw new Error('Routing failed');
        },
      };

      await expect(
        strategy.route({} as RoutingContext, {} as Config, {} as BaseLlmClient),
      ).rejects.toThrow('Routing failed');
    });
  });

  describe('metadata structure variations', () => {
    it('should support detailed reasoning', () => {
      const decision: RoutingDecision = {
        model: 'gemini-2.5-pro',
        metadata: {
          source: 'complexity-analyzer',
          latencyMs: 250,
          reasoning:
            'Analyzed conversation history (15 turns). ' +
            'Detected code generation request. ' +
            'Selected Pro model for superior code quality.',
        },
      };

      expect(decision.metadata.reasoning.length).toBeGreaterThan(50);
    });

    it('should support error with detailed message', () => {
      const decision: RoutingDecision = {
        model: 'gemini-2.0-flash',
        metadata: {
          source: 'fallback',
          latencyMs: 100,
          reasoning: 'Fallback due to primary strategy failure',
          error:
            'Primary model (gemini-2.5-pro) exceeded quota. Error: 429 Resource Exhausted',
        },
      };

      expect(decision.metadata.error).toContain('429');
    });

    it('should support zero latency for cached decisions', () => {
      const decision: RoutingDecision = {
        model: 'gemini-2.0-flash',
        metadata: {
          source: 'cache',
          latencyMs: 0,
          reasoning: 'Returned cached decision',
        },
      };

      expect(decision.metadata.latencyMs).toBe(0);
    });
  });

  describe('integration patterns', () => {
    it('should support chaining strategies', async () => {
      const strategy1: RoutingStrategy = {
        name: 'first',
        route: vi.fn().mockResolvedValue(null),
      };

      const strategy2: RoutingStrategy = {
        name: 'second',
        route: vi.fn().mockResolvedValue({
          model: 'gemini-2.5-pro',
          metadata: {
            source: 'second',
            latencyMs: 50,
            reasoning: 'First strategy declined',
          },
        }),
      };

      const mockContext: RoutingContext = {
        history: [],
        request: [{ text: 'test' }],
        signal: new AbortController().signal,
      };

      let decision = await strategy1.route(
        mockContext,
        {} as Config,
        {} as BaseLlmClient,
      );

      if (!decision) {
        decision = await strategy2.route(
          mockContext,
          {} as Config,
          {} as BaseLlmClient,
        );
      }

      expect(decision?.model).toBe('gemini-2.5-pro');
    });

    it('should support abort signal propagation', async () => {
      const abortController = new AbortController();
      const strategy: RoutingStrategy = {
        name: 'abortable',
        route: async (context) => new Promise((resolve, reject) => {
            context.signal.addEventListener('abort', () => {
              reject(new Error('Aborted'));
            });
          }),
      };

      const mockContext: RoutingContext = {
        history: [],
        request: [{ text: 'test' }],
        signal: abortController.signal,
      };

      const promise = strategy.route(
        mockContext,
        {} as Config,
        {} as BaseLlmClient,
      );

      abortController.abort();

      await expect(promise).rejects.toThrow('Aborted');
    });
  });
});
