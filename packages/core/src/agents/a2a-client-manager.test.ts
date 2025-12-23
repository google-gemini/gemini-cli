/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import {
  A2AClientManager,
  type SendMessageResult,
} from './a2a-client-manager.js';
import type { AgentCard } from '@a2a-js/sdk';
import type { AuthenticationHandler } from '@a2a-js/sdk/client';
import { ClientFactory, DefaultAgentCardResolver } from '@a2a-js/sdk/client';

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

  // Mock instances
  DefaultAgentCardResolver.prototype.resolve = vi.fn();

  // ClientFactory instance methods
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

import {
  createAuthenticatingFetchWithRetry,
  ClientFactoryOptions,
} from '@a2a-js/sdk/client';

describe('A2AClientManager', () => {
  let manager: A2AClientManager;
  const mockAgentCard: Partial<AgentCard> = { name: 'TestAgent' };

  // Mock Client object returned by createFromUrl
  const mockClient = {
    sendMessage: vi.fn(),
    getTask: vi.fn(),
    cancelTask: vi.fn(),
    getExtendedAgentCard: vi.fn(),
    getAgentCard: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    A2AClientManager.resetInstanceForTesting();
    manager = A2AClientManager.getInstance();

    // Setup Factory mock
    (ClientFactory.prototype.createFromUrl as Mock).mockResolvedValue(
      mockClient,
    );

    // Setup Resolver mock
    (DefaultAgentCardResolver.prototype.resolve as Mock).mockResolvedValue({
      ...mockAgentCard,
      url: 'http://test.agent/real/endpoint',
    });

    // Setup ClientFactoryOptions mock
    (ClientFactoryOptions.createFrom as Mock).mockImplementation(
      (_defaults, overrides) => overrides,
    );

    // Setup createAuthenticatingFetchWithRetry to return a mock fetch
    (createAuthenticatingFetchWithRetry as Mock).mockReturnValue(vi.fn());

    // Setup Client mocks
    mockClient.getExtendedAgentCard.mockResolvedValue({
      ...mockAgentCard,
      url: 'http://test.agent/real/endpoint',
    });

    mockClient.getAgentCard.mockResolvedValue({
      ...mockAgentCard,
      url: 'http://test.agent/real/endpoint',
    });

    // Mock successful sendMessage response (direct result)
    mockClient.sendMessage.mockResolvedValue({
      kind: 'message',
      messageId: 'a',
      parts: [],
      role: 'agent',
    } as SendMessageResult);

    mockClient.getTask.mockResolvedValue({
      id: 'task123',
      contextId: 'a',
      kind: 'task',
      status: { state: 'completed' },
    });

    mockClient.cancelTask.mockResolvedValue({
      id: 'task123',
      contextId: 'a',
      kind: 'task',
      status: { state: 'canceled' },
    });

    // Mock global.fetch for tests
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

      // createAuthenticatingFetchWithRetry should NOT be called
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
  });

  describe('sendMessage', () => {
    it('should send a message to the correct agent', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');
      await manager.sendMessage('TestAgent', 'Hello');
      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.anything(),
        }),
      );
    });

    it('should use contextId and taskId when provided', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');

      const expectedContextId = 'user-context-id';
      const expectedTaskId = 'user-task-id';

      await manager.sendMessage('TestAgent', 'Hello', {
        contextId: expectedContextId,
        taskId: expectedTaskId,
      });

      const call = mockClient.sendMessage.mock.calls[0][0];
      expect(call.message.contextId).toBe(expectedContextId);
      expect(call.message.taskId).toBe(expectedTaskId);
    });

    it('should return result from client', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');

      const mockResult = {
        contextId: 'server-context-id',
        id: 'ctx-1',
        kind: 'task',
        status: { state: 'working' },
      };

      // Mock client returning the result directly (mimics SendMessageResult cast)
      mockClient.sendMessage.mockResolvedValueOnce(mockResult);

      const response = await manager.sendMessage('TestAgent', 'Hello');

      expect(response).toEqual(mockResult);
    });

    it('should throw prefixed error on failure', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');

      mockClient.sendMessage.mockRejectedValueOnce(new Error('Network error'));

      await expect(manager.sendMessage('TestAgent', 'Hello')).rejects.toThrow(
        'A2AClient SendMessage Error: Network error',
      );
    });

    it('should throw an error if the agent is not found', async () => {
      await expect(
        manager.sendMessage('NonExistentAgent', 'Hello'),
      ).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });

  describe('getTask', () => {
    it('should get a task from the correct agent', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');
      await manager.getTask('TestAgent', 'task123');
      expect(mockClient.getTask).toHaveBeenCalledWith({
        id: 'task123',
      });
    });

    it('should throw an error if the agent is not found', async () => {
      await expect(
        manager.getTask('NonExistentAgent', 'task123'),
      ).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });

  describe('cancelTask', () => {
    it('should cancel a task on the correct agent', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');
      await manager.cancelTask('TestAgent', 'task123');
      expect(mockClient.cancelTask).toHaveBeenCalledWith({
        id: 'task123',
      });
    });

    it('should throw an error if the agent is not found', async () => {
      await expect(
        manager.cancelTask('NonExistentAgent', 'task123'),
      ).rejects.toThrow("Agent 'NonExistentAgent' not found.");
    });
  });
});
