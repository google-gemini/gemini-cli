/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { RemoteAgentInvocation } from './remote-invocation.js';
import { A2AClientManager } from './a2a-client-manager.js';
import type { RemoteAgentDefinition } from './types.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

// Mock A2AClientManager
vi.mock('./a2a-client-manager.js', () => {
  const A2AClientManager = {
    getInstance: vi.fn(),
  };
  return { A2AClientManager };
});

describe('RemoteAgentInvocation', () => {
  const mockDefinition: RemoteAgentDefinition = {
    name: 'test-agent',
    kind: 'remote',
    agentCardUrl: 'http://test-agent/card',
    displayName: 'Test Agent',
    description: 'A test agent',
    inputConfig: {
      inputs: {},
    },
  };

  const mockClientManager = {
    getClient: vi.fn(),
    loadAgent: vi.fn(),
    sendMessage: vi.fn(),
  };
  const mockMessageBus = createMockMessageBus();

  beforeEach(() => {
    vi.clearAllMocks();
    (A2AClientManager.getInstance as Mock).mockReturnValue(mockClientManager);
    (
      RemoteAgentInvocation as unknown as {
        sessionState?: Map<string, { contextId?: string; taskId?: string }>;
      }
    ).sessionState?.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor Validation', () => {
    it('accepts valid input with string query', () => {
      expect(() => {
        new RemoteAgentInvocation(
          mockDefinition,
          { query: 'valid' },
          mockMessageBus,
        );
      }).not.toThrow();
    });

    it('throws if query is missing', () => {
      expect(() => {
        new RemoteAgentInvocation(mockDefinition, {}, mockMessageBus);
      }).toThrow("requires a string 'query' input");
    });

    it('throws if query is not a string', () => {
      expect(() => {
        new RemoteAgentInvocation(
          mockDefinition,
          { query: 123 },
          mockMessageBus,
        );
      }).toThrow("requires a string 'query' input");
    });
  });

  describe('Execution Logic', () => {
    it('should lazy load the agent with ADCHandler if not present', async () => {
      mockClientManager.getClient.mockReturnValue(undefined);
      mockClientManager.sendMessage.mockResolvedValue({
        kind: 'message',
        messageId: 'msg-1',
        role: 'agent',
        parts: [{ kind: 'text', text: 'Hello' }],
      });

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'hi',
        },
        mockMessageBus,
      );
      await invocation.execute(new AbortController().signal);

      expect(mockClientManager.loadAgent).toHaveBeenCalledWith(
        'test-agent',
        'http://test-agent/card',
        expect.objectContaining({
          headers: expect.any(Function),
          shouldRetryWithHeaders: expect.any(Function),
        }),
      );
    });

    it('should not load the agent if already present', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessage.mockResolvedValue({
        kind: 'message',
        messageId: 'msg-1',
        role: 'agent',
        parts: [{ kind: 'text', text: 'Hello' }],
      });

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'hi',
        },
        mockMessageBus,
      );
      await invocation.execute(new AbortController().signal);

      expect(mockClientManager.loadAgent).not.toHaveBeenCalled();
    });

    it('should persist contextId and taskId across invocations', async () => {
      mockClientManager.getClient.mockReturnValue({});

      // First call return values
      mockClientManager.sendMessage.mockResolvedValueOnce({
        kind: 'message',
        messageId: 'msg-1',
        role: 'agent',
        parts: [{ kind: 'text', text: 'Response 1' }],
        contextId: 'ctx-1',
        taskId: 'task-1',
      });

      const invocation1 = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'first',
        },
        mockMessageBus,
      );

      // Execute first time
      const result1 = await invocation1.execute(new AbortController().signal);
      expect(result1.returnDisplay).toBe('Response 1');
      expect(mockClientManager.sendMessage).toHaveBeenLastCalledWith(
        'test-agent',
        'first',
        { contextId: undefined, taskId: undefined },
      );

      // Prepare for second call with simulated state persistence
      mockClientManager.sendMessage.mockResolvedValueOnce({
        kind: 'message',
        messageId: 'msg-2',
        role: 'agent',
        parts: [{ kind: 'text', text: 'Response 2' }],
        contextId: 'ctx-1',
        taskId: 'task-2',
      });

      const invocation2 = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'second',
        },
        mockMessageBus,
      );
      const result2 = await invocation2.execute(new AbortController().signal);
      expect(result2.returnDisplay).toBe('Response 2');

      expect(mockClientManager.sendMessage).toHaveBeenLastCalledWith(
        'test-agent',
        'second',
        { contextId: 'ctx-1', taskId: 'task-1' }, // Used state from first call
      );

      // Third call: Task completes
      mockClientManager.sendMessage.mockResolvedValueOnce({
        kind: 'task',
        id: 'task-2',
        contextId: 'ctx-1',
        status: { state: 'completed', message: undefined },
        artifacts: [],
        history: [],
      });

      const invocation3 = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'third',
        },
        mockMessageBus,
      );
      await invocation3.execute(new AbortController().signal);

      // Fourth call: Should start new task (taskId undefined)
      mockClientManager.sendMessage.mockResolvedValueOnce({
        kind: 'message',
        messageId: 'msg-3',
        role: 'agent',
        parts: [{ kind: 'text', text: 'New Task' }],
      });

      const invocation4 = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'fourth',
        },
        mockMessageBus,
      );
      await invocation4.execute(new AbortController().signal);

      expect(mockClientManager.sendMessage).toHaveBeenLastCalledWith(
        'test-agent',
        'fourth',
        { contextId: 'ctx-1', taskId: undefined }, // taskId cleared!
      );
    });

    it('should handle errors gracefully', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessage.mockRejectedValue(
        new Error('Network error'),
      );

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'hi',
        },
        mockMessageBus,
      );
      const result = await invocation.execute(new AbortController().signal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Network error');
      expect(result.returnDisplay).toContain('Network error');
    });

    it('should use a2a helpers for extracting text', async () => {
      mockClientManager.getClient.mockReturnValue({});
      // Mock a complex message part that needs extraction
      mockClientManager.sendMessage.mockResolvedValue({
        kind: 'message',
        messageId: 'msg-1',
        role: 'agent',
        parts: [
          { kind: 'text', text: 'Extracted text' },
          { kind: 'data', data: { foo: 'bar' } },
        ],
      });

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'hi',
        },
        mockMessageBus,
      );
      const result = await invocation.execute(new AbortController().signal);

      // Just check that text is present, exact formatting depends on helper
      expect(result.returnDisplay).toContain('Extracted text');
    });
  });

  describe('Confirmations', () => {
    it('should return info confirmation details', async () => {
      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'hi',
        },
        mockMessageBus,
      );
      // @ts-expect-error - getConfirmationDetails is protected
      const confirmation = await invocation.getConfirmationDetails(
        new AbortController().signal,
      );

      expect(confirmation).not.toBe(false);
      if (
        confirmation &&
        typeof confirmation === 'object' &&
        confirmation.type === 'info'
      ) {
        expect(confirmation.title).toContain('Test Agent');
        expect(confirmation.prompt).toContain('Calling remote agent: "hi"');
      } else {
        throw new Error('Expected confirmation to be of type info');
      }
    });
  });
});
