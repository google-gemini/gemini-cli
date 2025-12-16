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
import { A2AClientManager } from './a2a-client-manager.js';
import type { AgentCard } from '@a2a-js/sdk';
import { ClientFactory, DefaultAgentCardResolver } from '@a2a-js/sdk/client';
import { GoogleAuth } from 'google-auth-library';

import type { Config } from '../config/config.js';

vi.mock('@a2a-js/sdk/client', () => {
  const ClientFactory = vi.fn();
  const DefaultAgentCardResolver = vi.fn();
  const RestTransportFactory = vi.fn();
  const JsonRpcTransportFactory = vi.fn();

  // Mock instances
  DefaultAgentCardResolver.prototype.resolve = vi.fn();

  // ClientFactory instance
  ClientFactory.prototype.createFromUrl = vi.fn();

  return {
    ClientFactory,
    DefaultAgentCardResolver,
    RestTransportFactory,
    JsonRpcTransportFactory,
    // A2AClient is no longer directly mocked, its behavior is via ClientFactory
  };
});

vi.mock('google-auth-library', () => {
  const GoogleAuth = vi.fn();
  GoogleAuth.prototype.getClient = vi.fn();
  // Ensure the instance returned by the constructor uses the prototype method
  GoogleAuth.mockImplementation(() => ({
    getClient: GoogleAuth.prototype.getClient,
  }));
  return { GoogleAuth };
});

describe('A2AClientManager', () => {
  let manager: A2AClientManager;
  const mockAgentCard: Partial<AgentCard> = { name: 'TestAgent' };
  const mockConfig = {
    getDebugMode: vi.fn().mockReturnValue(true),
  } as unknown as Config;

  // Mock Client object returned by createFromUrl
  const mockClient = {
    sendMessage: vi.fn(),
    getTask: vi.fn(),
    cancelTask: vi.fn(),
    getExtendedAgentCard: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    A2AClientManager.resetInstanceForTesting();
    manager = A2AClientManager.getInstance(mockConfig);

    // Setup Factory mock
    (ClientFactory.prototype.createFromUrl as Mock).mockResolvedValue(mockClient);

    // Setup Resolver mock
    (DefaultAgentCardResolver.prototype.resolve as Mock).mockResolvedValue({
      ...mockAgentCard,
      url: 'http://test.agent/real/endpoint',
    });

    // Setup Client mocks
    mockClient.getExtendedAgentCard.mockResolvedValue({
        ...mockAgentCard,
        url: 'http://test.agent/real/endpoint',
    });

    mockClient.sendMessage.mockResolvedValue({
      kind: 'message',
      messageId: 'a',
      parts: [],
      role: 'agent',
    });

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

    // Mock global.fetch for ADC tests
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    // Mock GoogleAuth
    (GoogleAuth.prototype.getClient as Mock).mockResolvedValue({
      getAccessToken: vi.fn().mockResolvedValue({ token: 'adc-token' }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should enforce the singleton pattern', () => {
    const instance1 = A2AClientManager.getInstance(mockConfig);
    const instance2 = A2AClientManager.getInstance(mockConfig);
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

    it('should use ADC token when no access token is provided', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent/card');

      // The factory is created with options containing fetchImpl
      // We can grab the fetchImpl from the constructor call
      const constructorCalls = vi.mocked(ClientFactory).mock.calls;
      const options = constructorCalls[0][0]!;

      // Call fetchImpl
      // @ts-expect-error - fetchImpl is private or derived but accessing for test
      await options.transports![0]['options'].fetchImpl!('https://example.com/some/api', {
        method: undefined,
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchCalls = (global.fetch as Mock).mock.calls;
      const [url, init] = fetchCalls[0];
      expect(url).toBe('https://example.com/some/api');
      expect((init.headers as Headers).get('Authorization')).toBe(
        'Bearer adc-token',
      );
    });

    it('should use provided access token and NOT ADC when token is provided', async () => {
      await manager.loadAgent(
        'TestAgent',
        'http://test.agent',
        'provided-token',
      );

      const constructorCalls = vi.mocked(ClientFactory).mock.calls;
      const options = constructorCalls[0][0]!;

      // @ts-expect-error - testing fetchImpl
      await options.transports![0]['options'].fetchImpl!('https://example.com/api');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchCalls = (global.fetch as Mock).mock.calls;
      const [url, init] = fetchCalls[0];
      expect(url).toBe('https://example.com/api');
      expect((init.headers as Headers).get('Authorization')).toBe(
        'Bearer provided-token',
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

    it('should return contextId and taskId from the response', async () => {
      await manager.loadAgent('TestAgent', 'http://test.agent');

      // Mock response with IDs
      mockClient.sendMessage.mockResolvedValueOnce({
        contextId: 'server-context-id',
        id: 'ctx-1',
        kind: 'task',
        status: { state: 'working' },
      });

      const response = await manager.sendMessage('TestAgent', 'Hello');

      expect(response.contextId).toBe('server-context-id');
      expect(response.taskId).toBe('ctx-1');
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
