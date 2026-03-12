/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  A2AClientManager,
  type SendMessageResult,
} from './a2a-client-manager.js';
import type { AgentCard, Task } from '@a2a-js/sdk';
import {
  ClientFactory,
  DefaultAgentCardResolver,
  createAuthenticatingFetchWithRetry,
  ClientFactoryOptions,
  type AuthenticationHandler,
  type Client,
} from '@a2a-js/sdk/client';
import type { Config } from '../config/config.js';
import { Agent as UndiciAgent, ProxyAgent } from 'undici';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    debug: vi.fn(),
  },
}));

vi.mock('@a2a-js/sdk/client', () => {
  const ClientFactory = vi.fn();
  const DefaultAgentCardResolver = vi.fn();
  const RestTransportFactory = vi.fn();
  const JsonRpcTransportFactory = vi.fn();
  const ClientFactoryOptions = {
    default: {},
    createFrom: vi.fn(),
  };
  const createAuthenticatingFetchWithRetry = vi.fn();

  DefaultAgentCardResolver.prototype.resolve = vi.fn();
  ClientFactory.prototype.createFromUrl = vi.fn();

  return {
    ClientFactory,
    ClientFactoryOptions,
    DefaultAgentCardResolver,
    RestTransportFactory,
    JsonRpcTransportFactory,
    createAuthenticatingFetchWithRetry,
  };
});

describe('A2AClientManager', () => {
  let manager: A2AClientManager;

  // Stable mocks initialized once
  const sendMessageStreamMock = vi.fn();
  const getTaskMock = vi.fn();
  const cancelTaskMock = vi.fn();
  const getAgentCardMock = vi.fn();
  const authFetchMock = vi.fn();

  const mockClient = {
    sendMessageStream: sendMessageStreamMock,
    getTask: getTaskMock,
    cancelTask: cancelTaskMock,
    getAgentCard: getAgentCardMock,
  } as unknown as Client;

  const mockAgentCard: Partial<AgentCard> = { name: 'TestAgent' };

  beforeEach(() => {
    vi.clearAllMocks();
    A2AClientManager.resetInstanceForTesting();
    manager = A2AClientManager.getInstance();

    // Default mock implementations
    getAgentCardMock.mockResolvedValue({
      ...mockAgentCard,
      url: 'http://test.agent/real/endpoint',
    } as AgentCard);

    vi.mocked(ClientFactory.prototype.createFromUrl).mockResolvedValue(
      mockClient,
    );

    vi.mocked(DefaultAgentCardResolver.prototype.resolve).mockResolvedValue({
      ...mockAgentCard,
      url: 'http://test.agent/real/endpoint',
    } as AgentCard);

    vi.mocked(ClientFactoryOptions.createFrom).mockImplementation(
      (_defaults, overrides) => overrides as ClientFactoryOptions,
    );

    vi.mocked(createAuthenticatingFetchWithRetry).mockReturnValue(
      authFetchMock,
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

  describe('getInstance / dispatcher initialization', () => {
    it('should use UndiciAgent when no proxy is configured', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');

      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
        .calls[0][0];
      const cardFetch = resolverOptions?.fetchImpl as typeof fetch;
      await cardFetch('http://test.agent/card');

      const fetchCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => call[0] === 'http://test.agent/card');
      expect(fetchCall).toBeDefined();
      expect(
        (fetchCall![1] as { dispatcher?: unknown })?.dispatcher,
      ).toBeInstanceOf(UndiciAgent);
      expect(
        (fetchCall![1] as { dispatcher?: unknown })?.dispatcher,
      ).not.toBeInstanceOf(ProxyAgent);
    });

    it('should use ProxyAgent when a proxy is configured via Config', async () => {
      A2AClientManager.resetInstanceForTesting();
      const mockConfig = {
        getProxy: () => 'http://my-proxy:8080',
      } as Config;

      manager = A2AClientManager.getInstance(mockConfig);
      await manager.loadAgent('TestProxyAgent', 'http://test.proxy.agent/card');

      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
        .calls[0][0];
      const cardFetch = resolverOptions?.fetchImpl as typeof fetch;
      await cardFetch('http://test.proxy.agent/card');

      const fetchCall = vi
        .mocked(fetch)
        .mock.calls.find((call) => call[0] === 'http://test.proxy.agent/card');
      expect(fetchCall).toBeDefined();
      expect(
        (fetchCall![1] as { dispatcher?: unknown })?.dispatcher,
      ).toBeInstanceOf(ProxyAgent);
    });
  });

  describe('loadAgent', () => {
    it('should create and cache an A2AClient', async () => {
      const agentCard = await manager.loadAgent(
        'TestAgent',
        'http://test.agent/card',
      );
      expect(agentCard).toMatchObject(mockAgentCard);
      expect(manager.getAgentCard('TestAgent')).toBe(agentCard);
      expect(manager.getClient('TestAgent')).toBeDefined();
    });

    it('should throw an error if an agent with the same name is already loaded', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
      await expect(
        manager.loadAgent('TestAgent', 'http://another.agent/card'),
      ).rejects.toThrow("Agent with name 'TestAgent' is already loaded.");
    });

    it('should use native fetch by default', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
      expect(createAuthenticatingFetchWithRetry).not.toHaveBeenCalled();
    });

    it('should use provided custom authentication handler for transports only', async () => {
      const customAuthHandler = {
        headers: vi.fn(),
        shouldRetryWithHeaders: vi.fn(),
      };
      await manager.loadAgent(
        'CustomAuthAgent',
        'http://custom.agent/card',
        customAuthHandler as unknown as AuthenticationHandler,
      );

      expect(createAuthenticatingFetchWithRetry).toHaveBeenCalledWith(
        expect.anything(),
        customAuthHandler,
      );

      // Card resolver should NOT use the authenticated fetch by default.
      const resolverInstance = vi.mocked(DefaultAgentCardResolver).mock
        .instances[0];
      expect(resolverInstance).toBeDefined();
      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
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
        customAuthHandler as unknown as AuthenticationHandler,
      );

      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
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
        customAuthHandler as unknown as AuthenticationHandler,
      );

      const resolverOptions = vi.mocked(DefaultAgentCardResolver).mock
        .calls[0][0];
      const cardFetch = resolverOptions?.fetchImpl as typeof fetch;

      await cardFetch('http://test.url');

      expect(fetch).toHaveBeenCalledWith('http://test.url', expect.anything());
      expect(authFetchMock).toHaveBeenCalledWith('http://test.url', undefined);
    });

    it('should log a debug message upon loading an agent', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
      expect(debugLogger.debug).toHaveBeenCalledWith(
        "[A2AClientManager] Loaded agent 'TestAgent' from http://test.agent/card",
      );
    });

    it('should clear the cache', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');
      expect(manager.getAgentCard('TestAgent')).toBeDefined();
      expect(manager.getClient('TestAgent')).toBeDefined();

      manager.clearCache();

      expect(manager.getAgentCard('TestAgent')).toBeUndefined();
      expect(manager.getClient('TestAgent')).toBeUndefined();
      expect(debugLogger.debug).toHaveBeenCalledWith(
        '[A2AClientManager] Cache cleared.',
      );
    });
  });

  describe('sendMessageStream', () => {
    beforeEach(async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');
    });

    it('should send a message and return a stream', async () => {
      const mockResult = {
        kind: 'message',
        messageId: 'a',
        parts: [],
        role: 'agent',
      } as SendMessageResult;

      sendMessageStreamMock.mockReturnValue(
        (async function* () {
          yield mockResult;
        })(),
      );

      const stream = manager.sendMessageStream('TestAgent', 'Hello');
      const results = [];
      for await (const res of stream) {
        results.push(res);
      }

      expect(results).toEqual([mockResult]);
      expect(sendMessageStreamMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.anything(),
        }),
        expect.any(Object),
      );
    });

    it('should use contextId and taskId when provided', async () => {
      sendMessageStreamMock.mockReturnValue(
        (async function* () {
          yield {
            kind: 'message',
            messageId: 'a',
            parts: [],
            role: 'agent',
          } as SendMessageResult;
        })(),
      );

      const expectedContextId = 'user-context-id';
      const expectedTaskId = 'user-task-id';

      const stream = manager.sendMessageStream('TestAgent', 'Hello', {
        contextId: expectedContextId,
        taskId: expectedTaskId,
      });

      for await (const _ of stream) {
        // consume stream
      }

      const call = sendMessageStreamMock.mock.calls[0][0];
      expect(call.message.contextId).toBe(expectedContextId);
      expect(call.message.taskId).toBe(expectedTaskId);
    });

    it('should propagate the original error on failure', async () => {
      sendMessageStreamMock.mockImplementationOnce(() => {
        throw new Error('Network error');
      });

      const stream = manager.sendMessageStream('TestAgent', 'Hello');
      await expect(async () => {
        for await (const _ of stream) {
          // consume
        }
      }).rejects.toThrow('Network error');
    });

    it('should throw an error if the agent is not found', async () => {
      const stream = manager.sendMessageStream('NonExistentAgent', 'Hello');
      await expect(async () => {
        for await (const _ of stream) {
          // consume
        }
      }).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });

  describe('getTask', () => {
    beforeEach(async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');
    });

    it('should get a task from the correct agent', async () => {
      getTaskMock.mockResolvedValue({
        id: 'task123',
        contextId: 'a',
        kind: 'task',
        status: { state: 'completed' },
      } as Task);

      await manager.getTask('TestAgent', 'task123');
      expect(getTaskMock).toHaveBeenCalledWith({
        id: 'task123',
      });
    });

    it('should throw prefixed error on failure', async () => {
      getTaskMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(manager.getTask('TestAgent', 'task123')).rejects.toThrow(
        'A2AClient getTask Error [TestAgent]: Network error',
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
      await manager.loadAgent('TestAgent', 'http://test.agent');
    });

    it('should cancel a task on the correct agent', async () => {
      cancelTaskMock.mockResolvedValue({
        id: 'task123',
        contextId: 'a',
        kind: 'task',
        status: { state: 'canceled' },
      } as Task);

      await manager.cancelTask('TestAgent', 'task123');
      expect(cancelTaskMock).toHaveBeenCalledWith({
        id: 'task123',
      });
    });

    it('should throw prefixed error on failure', async () => {
      cancelTaskMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(manager.cancelTask('TestAgent', 'task123')).rejects.toThrow(
        'A2AClient cancelTask Error [TestAgent]: Network error',
      );
    });

    it('should throw an error if the agent is not found', async () => {
      await expect(
        manager.cancelTask('NonExistentAgent', 'task123'),
      ).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });
});
