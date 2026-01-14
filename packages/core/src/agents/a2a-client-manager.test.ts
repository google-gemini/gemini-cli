/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  A2AClientManager,
  type SendMessageResult,
  createAdapterFetch,
} from './a2a-client-manager.js';
import type { AgentCard, Task } from '@a2a-js/sdk';
import type { AuthenticationHandler, Client } from '@a2a-js/sdk/client';
import { ClientFactory, DefaultAgentCardResolver } from '@a2a-js/sdk/client';
import { debugLogger } from '../utils/debugLogger.js';
import {
  createAuthenticatingFetchWithRetry,
  ClientFactoryOptions,
} from '@a2a-js/sdk/client';

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
  const sendMessageMock = vi.fn();
  const getTaskMock = vi.fn();
  const cancelTaskMock = vi.fn();
  const getAgentCardMock = vi.fn();
  const authFetchMock = vi.fn();

  const mockClient = {
    sendMessage: sendMessageMock,
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

    it('should use provided custom authentication handler', async () => {
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

  describe('sendMessage', () => {
    beforeEach(async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');
    });

    it('should send a message to the correct agent', async () => {
      sendMessageMock.mockResolvedValue({
        kind: 'message',
        messageId: 'a',
        parts: [],
        role: 'agent',
      } as SendMessageResult);

      await manager.sendMessage('TestAgent', 'Hello');
      expect(sendMessageMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.anything(),
        }),
      );
    });

    it('should use contextId and taskId when provided', async () => {
      sendMessageMock.mockResolvedValue({
        kind: 'message',
        messageId: 'a',
        parts: [],
        role: 'agent',
      } as SendMessageResult);

      const expectedContextId = 'user-context-id';
      const expectedTaskId = 'user-task-id';

      await manager.sendMessage('TestAgent', 'Hello', {
        contextId: expectedContextId,
        taskId: expectedTaskId,
      });

      const call = sendMessageMock.mock.calls[0][0];
      expect(call.message.contextId).toBe(expectedContextId);
      expect(call.message.taskId).toBe(expectedTaskId);
    });

    it('should return result from client', async () => {
      const mockResult = {
        contextId: 'server-context-id',
        id: 'ctx-1',
        kind: 'task',
        status: { state: 'working' },
      };

      sendMessageMock.mockResolvedValueOnce(mockResult as SendMessageResult);

      const response = await manager.sendMessage('TestAgent', 'Hello');

      expect(response).toEqual(mockResult);
    });

    it('should throw prefixed error on failure', async () => {
      sendMessageMock.mockRejectedValueOnce(new Error('Network error'));

      await expect(manager.sendMessage('TestAgent', 'Hello')).rejects.toThrow(
        'A2AClient SendMessage Error [TestAgent]: Network error',
      );
    });

    it('should throw an error if the agent is not found', async () => {
      await expect(
        manager.sendMessage('NonExistentAgent', 'Hello'),
      ).rejects.toThrow("Agent 'NonExistentAgent' not found.");
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

  describe('createAdapterFetch', () => {
    it('normalizes TASK_STATE_ enums to lower-case', async () => {
      const baseFetch = vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ status: { state: 'TASK_STATE_WORKING' } }),
          ),
        );

      const adapter = createAdapterFetch(baseFetch as typeof fetch);
      const response = await adapter('http://example.com', {
        method: 'POST',
        body: '{}',
      });
      const data = await response.json();

      expect(data.status.state).toBe('working');
    });

    it('lowercases non-prefixed task states', async () => {
      const baseFetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ status: { state: 'WORKING' } })),
        );

      const adapter = createAdapterFetch(baseFetch as typeof fetch);
      const response = await adapter('http://example.com', {
        method: 'POST',
        body: '{}',
      });
      const data = await response.json();

      expect(data.status.state).toBe('working');
    });

    it('bypasses adapter for JSON-RPC requests', async () => {
      const baseFetch = vi.fn().mockResolvedValue(new Response('{}'));
      const adapter = createAdapterFetch(baseFetch as typeof fetch);
      const rpcBody = JSON.stringify({ jsonrpc: '2.0', method: 'foo' });

      await adapter('http://example.com', {
        method: 'POST',
        body: rpcBody,
      });

      // Verify baseFetch was called with original body, not modified
      expect(baseFetch).toHaveBeenCalledWith(
        'http://example.com',
        expect.objectContaining({ body: rpcBody }),
      );
    });

    it('applies dialect translation for remote REST requests', async () => {
      const baseFetch = vi.fn().mockResolvedValue(new Response('{}'));
      const adapter = createAdapterFetch(baseFetch as typeof fetch);
      const originalBody = JSON.stringify({
        message: {
          role: 'user',
          parts: [{ kind: 'text', text: 'hi' }],
        },
      });

      await adapter('https://remote-agent.com/v1/message:send', {
        method: 'POST',
        body: originalBody,
      });

      // Verify body WAS modified:
      // 1. role: 'user' -> 'ROLE_USER'
      // 2. parts mapped to content, kind stripped
      const expectedBody = JSON.stringify({
        message: {
          role: 'ROLE_USER',
          content: [{ text: 'hi' }],
        },
      });

      expect(baseFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ body: expectedBody }),
      );
    });
  });
});
