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
import {
  A2AClientManager,
  type SendMessageResult,
} from './a2a-client-manager.js';
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
      inputSchema: { type: 'object' },
    },
  };

  const mockClientManager = {
    getClient: vi.fn(),
    loadAgent: vi.fn(),
    sendMessageStream: vi.fn(),
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

    it('accepts missing query (defaults to "Get Started!")', () => {
      expect(() => {
        new RemoteAgentInvocation(mockDefinition, {}, mockMessageBus);
      }).not.toThrow();
    });

    it('uses "Get Started!" default when query is missing during execution', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Hello' }],
          };
        },
      );

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        {},
        mockMessageBus,
      );
      await invocation.execute(new AbortController().signal);

      expect(mockClientManager.sendMessageStream).toHaveBeenCalledWith(
        'test-agent',
        'Get Started!',
        expect.objectContaining({ signal: expect.any(Object) }),
      );
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
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Hello' }],
          };
        },
      );

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
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Hello' }],
          };
        },
      );

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
      mockClientManager.sendMessageStream.mockImplementationOnce(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Response 1' }],
            contextId: 'ctx-1',
            taskId: 'task-1',
          };
        },
      );

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
      expect(mockClientManager.sendMessageStream).toHaveBeenLastCalledWith(
        'test-agent',
        'first',
        { contextId: undefined, taskId: undefined, signal: expect.any(Object) },
      );

      // Prepare for second call with simulated state persistence
      mockClientManager.sendMessageStream.mockImplementationOnce(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-2',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Response 2' }],
            contextId: 'ctx-1',
            taskId: 'task-2',
          };
        },
      );

      const invocation2 = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'second',
        },
        mockMessageBus,
      );
      const result2 = await invocation2.execute(new AbortController().signal);
      expect(result2.returnDisplay).toBe('Response 2');

      expect(mockClientManager.sendMessageStream).toHaveBeenLastCalledWith(
        'test-agent',
        'second',
        { contextId: 'ctx-1', taskId: 'task-1', signal: expect.any(Object) }, // Used state from first call
      );

      // Third call: Task completes
      mockClientManager.sendMessageStream.mockImplementationOnce(
        async function* () {
          yield {
            kind: 'task',
            id: 'task-2',
            contextId: 'ctx-1',
            status: { state: 'completed', message: undefined },
            artifacts: [],
            history: [],
          };
        },
      );

      const invocation3 = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'third',
        },
        mockMessageBus,
      );
      await invocation3.execute(new AbortController().signal);

      // Fourth call: Should start new task (taskId undefined)
      mockClientManager.sendMessageStream.mockImplementationOnce(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-3',
            role: 'agent',
            parts: [{ kind: 'text', text: 'New Task' }],
          };
        },
      );

      const invocation4 = new RemoteAgentInvocation(
        mockDefinition,
        {
          query: 'fourth',
        },
        mockMessageBus,
      );
      await invocation4.execute(new AbortController().signal);

      expect(mockClientManager.sendMessageStream).toHaveBeenLastCalledWith(
        'test-agent',
        'fourth',
        { contextId: 'ctx-1', taskId: undefined, signal: expect.any(Object) }, // taskId cleared!
      );
    });

    it('should handle streaming updates and reassemble output', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Hello' }],
          };
          yield {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Hello World' }],
          };
        },
      );

      const updateOutput = vi.fn();
      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        { query: 'hi' },
        mockMessageBus,
      );
      await invocation.execute(new AbortController().signal, updateOutput);

      expect(updateOutput).toHaveBeenCalledWith('Hello');
      expect(updateOutput).toHaveBeenCalledWith('Hello\n\nHello World');
    });

    it('should abort when signal is aborted during streaming', async () => {
      mockClientManager.getClient.mockReturnValue({});
      const controller = new AbortController();
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Partial' }],
          };
          // Simulate abort between chunks
          controller.abort();
          yield {
            kind: 'message',
            messageId: 'msg-2',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Partial response continued' }],
          };
        },
      );

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        { query: 'hi' },
        mockMessageBus,
      );
      const result = await invocation.execute(controller.signal);

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Operation aborted');
    });

    it('should handle errors gracefully', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          if (Math.random() < 0) yield {} as unknown as SendMessageResult;
          throw new Error('Network error');
        },
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
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [
              { kind: 'text', text: 'Extracted text' },
              { kind: 'data', data: { foo: 'bar' } },
            ],
          };
        },
      );

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

    it('should handle mixed response types during streaming (TaskStatusUpdateEvent + Message)', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield {
            kind: 'status-update',
            taskId: 'task-1',
            contextId: 'ctx-1',
            final: false,
            status: {
              state: 'working',
              message: {
                kind: 'message',
                role: 'agent',
                messageId: 'm1',
                parts: [{ kind: 'text', text: 'Thinking...' }],
              },
            },
          };
          yield {
            kind: 'message',
            messageId: 'msg-final',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Final Answer' }],
          };
        },
      );

      const updateOutput = vi.fn();
      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        { query: 'hi' },
        mockMessageBus,
      );
      const result = await invocation.execute(
        new AbortController().signal,
        updateOutput,
      );

      expect(updateOutput).toHaveBeenCalledWith('Thinking...');
      expect(updateOutput).toHaveBeenCalledWith('Thinking...\n\nFinal Answer');
      expect(result.returnDisplay).toBe('Thinking...\n\nFinal Answer');
    });

    it('should handle artifact reassembly with append: true', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield {
            kind: 'status-update',
            taskId: 'task-1',
            status: {
              state: 'working',
              message: {
                kind: 'message',
                role: 'agent',
                parts: [{ kind: 'text', text: 'Generating...' }],
              },
            },
          };
          yield {
            kind: 'artifact-update',
            taskId: 'task-1',
            append: false,
            artifact: {
              artifactId: 'art-1',
              name: 'Result',
              parts: [{ kind: 'text', text: 'Part 1' }],
            },
          };
          yield {
            kind: 'artifact-update',
            taskId: 'task-1',
            append: true,
            artifact: {
              artifactId: 'art-1',
              parts: [{ kind: 'text', text: ' Part 2' }],
            },
          };
        },
      );

      const updateOutput = vi.fn();
      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        { query: 'hi' },
        mockMessageBus,
      );
      await invocation.execute(new AbortController().signal, updateOutput);

      expect(updateOutput).toHaveBeenCalledWith('Generating...');
      expect(updateOutput).toHaveBeenCalledWith(
        'Generating...\n\nArtifact (Result):\nPart 1',
      );
      expect(updateOutput).toHaveBeenCalledWith(
        'Generating...\n\nArtifact (Result):\nPart 1 Part 2',
      );
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
