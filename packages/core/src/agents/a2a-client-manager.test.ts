/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { A2AClientManager } from './a2a-client-manager.js';
import type { AgentCard } from '@a2a-js/sdk';
import * as sdkClient from '@a2a-js/sdk/client';
import * as dnsPromises from 'node:dns/promises';
import type { LookupOptions } from 'node:dns';
import { debugLogger } from '../utils/debugLogger.js';

interface MockClient {
  sendMessageStream: ReturnType<typeof vi.fn>;
  getTask: ReturnType<typeof vi.fn>;
  cancelTask: ReturnType<typeof vi.fn>;
}

vi.mock('@a2a-js/sdk/client', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    createAuthenticatingFetchWithRetry: vi.fn(),
    ClientFactory: vi.fn(),
    DefaultAgentCardResolver: vi.fn(),
    ClientFactoryOptions: {
      createFrom: vi.fn(),
      default: {},
    },
  };
});

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    debug: vi.fn(),
  },
}));

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

describe('A2AClientManager', () => {
  let manager: A2AClientManager;
  const mockAgentCard: AgentCard = {
    name: 'test-agent',
    description: 'A test agent',
    url: 'http://test.agent',
    version: '1.0.0',
    protocolVersion: '0.1.0',
    capabilities: {},
    skills: [],
    defaultInputModes: [],
    defaultOutputModes: [],
  };

  const mockClient: MockClient = {
    sendMessageStream: vi.fn(),
    getTask: vi.fn(),
    cancelTask: vi.fn(),
  };

  const authFetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    manager = A2AClientManager.getInstance();
    manager.clearCache();

    // Default DNS mock: resolve to public IP.
    // Use any cast only for return value due to complex multi-signature overloads.
    vi.mocked(dnsPromises.lookup).mockImplementation(
      async (_h: string, options?: LookupOptions | number) => {
        const addr = { address: '93.184.216.34', family: 4 };
        const isAll = typeof options === 'object' && options?.all;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (isAll ? [addr] : addr) as any;
      },
    );

    // Re-create the instances as plain objects that can be spied on
    const factoryInstance = {
      createFromUrl: vi.fn(),
      createFromAgentCard: vi.fn(),
    };
    const resolverInstance = {
      resolve: vi.fn(),
    };

    vi.mocked(sdkClient.ClientFactory).mockReturnValue(
      factoryInstance as unknown as sdkClient.ClientFactory,
    );
    vi.mocked(sdkClient.DefaultAgentCardResolver).mockReturnValue(
      resolverInstance as unknown as sdkClient.DefaultAgentCardResolver,
    );

    vi.spyOn(factoryInstance, 'createFromUrl').mockResolvedValue(
      mockClient as unknown as sdkClient.Client,
    );
    vi.spyOn(factoryInstance, 'createFromAgentCard').mockResolvedValue(
      mockClient as unknown as sdkClient.Client,
    );
    vi.spyOn(resolverInstance, 'resolve').mockResolvedValue({
      ...mockAgentCard,
      url: 'http://test.agent/real/endpoint',
    } as AgentCard);

    vi.spyOn(sdkClient.ClientFactoryOptions, 'createFrom').mockImplementation(
      (_defaults, overrides) =>
        overrides as unknown as sdkClient.ClientFactoryOptions,
    );

    vi.mocked(sdkClient.createAuthenticatingFetchWithRetry).mockImplementation(
      () =>
        authFetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({}),
        } as Response),
    );

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as Response),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should enforce the singleton pattern', () => {
    const instance1 = A2AClientManager.getInstance();
    const instance2 = A2AClientManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  describe('loadAgent', () => {
    it('should create and cache an A2AClient', async () => {
      const agentCard = await manager.loadAgent(
        'TestAgent',
        'http://test.agent/card',
      );
      expect(manager.getAgentCard('TestAgent')).toBe(agentCard);
      expect(manager.getClient('TestAgent')).toBeDefined();
    });

    it('should configure ClientFactory with REST, JSON-RPC, and gRPC transports', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
      expect(sdkClient.ClientFactoryOptions.createFrom).toHaveBeenCalled();
    });

    it('should throw an error if an agent with the same name is already loaded', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
      await expect(
        manager.loadAgent('TestAgent', 'http://test.agent/card'),
      ).rejects.toThrow("Agent with name 'TestAgent' is already loaded.");
    });

    it('should use native fetch by default', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
      expect(
        sdkClient.createAuthenticatingFetchWithRetry,
      ).not.toHaveBeenCalled();
    });

    it('should use provided custom authentication handler for transports only', async () => {
      const customAuthHandler = {
        headers: vi.fn(),
        shouldRetryWithHeaders: vi.fn(),
      };
      await manager.loadAgent(
        'TestAgent',
        'http://test.agent/card',
        customAuthHandler as unknown as sdkClient.AuthenticationHandler,
      );

      // Card resolver should NOT use the authenticated fetch by default.
      const resolverOptions = vi.mocked(sdkClient.DefaultAgentCardResolver).mock
        .calls[0][0];
      expect(resolverOptions?.fetchImpl).not.toBe(authFetchMock);
    });

    it('should use unauthenticated fetch for card resolver and avoid authenticated fetch if success', async () => {
      const customAuthHandler = {
        headers: vi.fn(),
        shouldRetryWithHeaders: vi.fn(),
      };
      await manager.loadAgent(
        'AuthCardAgent',
        'http://authcard.agent/card',
        customAuthHandler as unknown as sdkClient.AuthenticationHandler,
      );

      const resolverOptions = vi.mocked(sdkClient.DefaultAgentCardResolver).mock
        .calls[0][0];
      const cardFetch = resolverOptions?.fetchImpl as typeof fetch;

      expect(cardFetch).toBeDefined();

      await cardFetch('http://test.url');

      expect(fetch).toHaveBeenCalledWith('http://test.url', expect.anything());
      expect(authFetchMock).not.toHaveBeenCalled();
    });

    it('should retry with authenticating fetch if agent card fetch returns 401', async () => {
      const customAuthHandler = {
        headers: vi.fn(),
        shouldRetryWithHeaders: vi.fn(),
      };

      // Mock the initial unauthenticated fetch to fail with 401
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      } as Response);

      await manager.loadAgent(
        'AuthCardAgent401',
        'http://authcard.agent/card',
        customAuthHandler as unknown as sdkClient.AuthenticationHandler,
      );

      const resolverOptions = vi.mocked(sdkClient.DefaultAgentCardResolver).mock
        .calls[0][0];
      const cardFetch = resolverOptions?.fetchImpl as typeof fetch;

      await cardFetch('http://test.url');

      expect(fetch).toHaveBeenCalledWith('http://test.url', expect.anything());
      expect(authFetchMock).toHaveBeenCalledWith('http://test.url', undefined);
    });

    it('should log a debug message upon loading an agent', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
      expect(debugLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("Loaded agent 'TestAgent'"),
      );
    });

    it('should clear the cache', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
      manager.clearCache();
      expect(manager.getAgentCard('TestAgent')).toBeUndefined();
      expect(manager.getClient('TestAgent')).toBeUndefined();
    });

    it('should throw if resolveAgentCard fails', async () => {
      const resolverInstance = {
        resolve: vi.fn().mockRejectedValue(new Error('Resolution failed')),
      };
      vi.mocked(sdkClient.DefaultAgentCardResolver).mockReturnValue(
        resolverInstance as unknown as sdkClient.DefaultAgentCardResolver,
      );

      await expect(
        manager.loadAgent('FailAgent', 'http://fail.agent'),
      ).rejects.toThrow('Resolution failed');
    });

    it('should throw if factory.createFromAgentCard fails', async () => {
      const factoryInstance = {
        createFromAgentCard: vi
          .fn()
          .mockRejectedValue(new Error('Factory failed')),
      };
      vi.mocked(sdkClient.ClientFactory).mockReturnValue(
        factoryInstance as unknown as sdkClient.ClientFactory,
      );

      await expect(
        manager.loadAgent('FailAgent', 'http://fail.agent'),
      ).rejects.toThrow('Factory failed');
    });
  });

  describe('getAgentCard and getClient', () => {
    it('should return undefined if agent is not found', () => {
      expect(manager.getAgentCard('Unknown')).toBeUndefined();
      expect(manager.getClient('Unknown')).toBeUndefined();
    });
  });

  describe('sendMessageStream', () => {
    beforeEach(async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
    });

    it('should send a message and return a stream', async () => {
      mockClient.sendMessageStream.mockReturnValue(
        (async function* () {
          yield { kind: 'message' };
        })(),
      );

      const stream = manager.sendMessageStream('TestAgent', 'Hello');
      const results = [];
      for await (const result of stream) {
        results.push(result);
      }

      expect(results).toHaveLength(1);
      expect(mockClient.sendMessageStream).toHaveBeenCalled();
    });

    it('should use contextId and taskId when provided', async () => {
      mockClient.sendMessageStream.mockReturnValue(
        (async function* () {
          yield { kind: 'message' };
        })(),
      );

      const stream = manager.sendMessageStream('TestAgent', 'Hello', {
        contextId: 'ctx123',
        taskId: 'task456',
      });
      // trigger execution
      for await (const _ of stream) {
        break;
      }

      expect(mockClient.sendMessageStream).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.objectContaining({
            contextId: 'ctx123',
            taskId: 'task456',
          }),
        }),
        expect.any(Object),
      );
    });

    it('should correctly propagate AbortSignal to the stream', async () => {
      mockClient.sendMessageStream.mockReturnValue(
        (async function* () {
          yield { kind: 'message' };
        })(),
      );

      const controller = new AbortController();
      const stream = manager.sendMessageStream('TestAgent', 'Hello', {
        signal: controller.signal,
      });
      // trigger execution
      for await (const _ of stream) {
        break;
      }

      expect(mockClient.sendMessageStream).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('should handle a multi-chunk stream with different event types', async () => {
      mockClient.sendMessageStream.mockReturnValue(
        (async function* () {
          yield { kind: 'message', messageId: 'm1' };
          yield { kind: 'status-update', taskId: 't1' };
        })(),
      );

      const stream = manager.sendMessageStream('TestAgent', 'Hello');
      const results = [];
      for await (const result of stream) {
        results.push(result);
      }

      expect(results).toHaveLength(2);
      expect(results[0].kind).toBe('message');
      expect(results[1].kind).toBe('status-update');
    });

    it('should throw prefixed error on failure', async () => {
      mockClient.sendMessageStream.mockImplementation(() => {
        throw new Error('Network failure');
      });

      const stream = manager.sendMessageStream('TestAgent', 'Hello');
      await expect(async () => {
        for await (const _ of stream) {
          // empty
        }
      }).rejects.toThrow(
        '[A2AClientManager] sendMessageStream Error [TestAgent]: Network failure',
      );
    });

    it('should throw an error if the agent is not found', async () => {
      const stream = manager.sendMessageStream('NonExistentAgent', 'Hello');
      await expect(async () => {
        for await (const _ of stream) {
          // empty
        }
      }).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });

  describe('getTask', () => {
    beforeEach(async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
    });

    it('should get a task from the correct agent', async () => {
      const mockTask = { id: 'task123', kind: 'task' };
      mockClient.getTask.mockResolvedValue(mockTask);

      const result = await manager.getTask('TestAgent', 'task123');
      expect(result).toBe(mockTask);
      expect(mockClient.getTask).toHaveBeenCalledWith({ id: 'task123' });
    });

    it('should throw prefixed error on failure', async () => {
      mockClient.getTask.mockRejectedValue(new Error('Not found'));

      await expect(manager.getTask('TestAgent', 'task123')).rejects.toThrow(
        'A2AClient getTask Error [TestAgent]: Not found',
      );
    });

    it('should throw an error if the agent is not found', async () => {
      await expect(
        manager.getTask('NonExistentAgent', 'task123'),
      ).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });

  describe('cancelTask', () => {
    beforeEach(async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
    });

    it('should cancel a task on the correct agent', async () => {
      const mockTask = { id: 'task123', kind: 'task' };
      mockClient.cancelTask.mockResolvedValue(mockTask);

      const result = await manager.cancelTask('TestAgent', 'task123');
      expect(result).toBe(mockTask);
      expect(mockClient.cancelTask).toHaveBeenCalledWith({ id: 'task123' });
    });

    it('should throw prefixed error on failure', async () => {
      mockClient.cancelTask.mockRejectedValue(new Error('Cannot cancel'));

      await expect(manager.cancelTask('TestAgent', 'task123')).rejects.toThrow(
        'A2AClient cancelTask Error [TestAgent]: Cannot cancel',
      );
    });

    it('should throw an error if the agent is not found', async () => {
      await expect(
        manager.cancelTask('NonExistentAgent', 'task123'),
      ).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });

  describe('Protocol Routing & URL Logic', () => {
    it('should correctly split URLs to prevent .well-known doubling', async () => {
      const fullUrl = 'http://localhost:9001/.well-known/agent-card.json';
      const resolverInstance = {
        resolve: vi.fn().mockResolvedValue({ name: 'test' } as AgentCard),
      };
      vi.mocked(sdkClient.DefaultAgentCardResolver).mockReturnValue(
        resolverInstance as unknown as sdkClient.DefaultAgentCardResolver,
      );

      await manager.loadAgent('test-doubling', fullUrl);

      expect(resolverInstance.resolve).toHaveBeenCalledWith(
        'http://localhost:9001/',
        undefined,
      );
    });

    it('should throw if a remote agent uses a private IP (SSRF protection)', async () => {
      const privateUrl = 'http://169.254.169.254/.well-known/agent-card.json';
      await expect(manager.loadAgent('ssrf-agent', privateUrl)).rejects.toThrow(
        /Refusing to load agent 'ssrf-agent' from private IP range/,
      );
    });

    it('should throw if a domain resolves to a private IP (DNS SSRF protection)', async () => {
      const maliciousDomainUrl =
        'http://malicious.com/.well-known/agent-card.json';

      vi.mocked(dnsPromises.lookup).mockImplementationOnce(
        async (_h: string, options?: LookupOptions | number) => {
          const addr = { address: '10.0.0.1', family: 4 };
          const isAll = typeof options === 'object' && options?.all;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (isAll ? [addr] : addr) as any;
        },
      );

      await expect(
        manager.loadAgent('dns-ssrf-agent', maliciousDomainUrl),
      ).rejects.toThrow(/private IP range/);
    });

    it('should throw if a public agent card contains a private transport URL (Deep SSRF protection)', async () => {
      const publicUrl = 'https://public.agent.com/card.json';
      const resolverInstance = {
        resolve: vi.fn().mockResolvedValue({
          ...mockAgentCard,
          url: 'http://192.168.1.1/api', // Malicious private transport in public card
        } as AgentCard),
      };
      vi.mocked(sdkClient.DefaultAgentCardResolver).mockReturnValue(
        resolverInstance as unknown as sdkClient.DefaultAgentCardResolver,
      );

      // DNS for public.agent.com is public
      vi.mocked(dnsPromises.lookup).mockImplementation(
        async (hostname: string, options?: LookupOptions | number) => {
          const isAll = typeof options === 'object' && options?.all;
          if (hostname === 'public.agent.com') {
            const addr = { address: '1.1.1.1', family: 4 };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (isAll ? [addr] : addr) as any;
          }
          const addr = { address: '192.168.1.1', family: 4 };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (isAll ? [addr] : addr) as any;
        },
      );

      await expect(
        manager.loadAgent('malicious-agent', publicUrl),
      ).rejects.toThrow(
        /contains transport URL pointing to private IP range: http:\/\/192.168.1.1\/api/,
      );
    });
  });
});
