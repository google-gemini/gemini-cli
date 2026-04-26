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
import type { Client } from '@a2a-js/sdk/client';
import { RemoteAgentInvocation } from './remote-invocation.js';
import {
  type SendMessageResult,
  type A2AClientManager,
} from './a2a-client-manager.js';

import type { RemoteAgentDefinition, SubagentProgress } from './types.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { A2AAuthProviderFactory } from './auth-provider/factory.js';
import type { A2AAuthProvider } from './auth-provider/types.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { Config } from '../config/config.js';

// Mock A2AClientManager
vi.mock('./a2a-client-manager.js', () => ({
  A2AClientManager: vi.fn().mockImplementation(() => ({
    getClient: vi.fn(),
    loadAgent: vi.fn(),
    sendMessageStream: vi.fn(),
  })),
}));

// Mock A2AAuthProviderFactory
vi.mock('./auth-provider/factory.js', () => ({
  A2AAuthProviderFactory: {
    create: vi.fn(),
  },
}));

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

  let mockClientManager: {
    getClient: Mock<A2AClientManager['getClient']>;
    loadAgent: Mock<A2AClientManager['loadAgent']>;
    sendMessageStream: Mock<A2AClientManager['sendMessageStream']>;
  };
  let mockContext: AgentLoopContext;
  const mockMessageBus = createMockMessageBus();

  const mockClient = {
    sendMessageStream: vi.fn(),
    getTask: vi.fn(),
    cancelTask: vi.fn(),
  } as unknown as Client;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClientManager = {
      getClient: vi.fn(),
      loadAgent: vi.fn(),
      sendMessageStream: vi.fn(),
    };

    const mockConfig = {
      getA2AClientManager: vi.fn().mockReturnValue(mockClientManager),
      injectionService: {
        getLatestInjectionIndex: vi.fn().mockReturnValue(0),
      },
    } as unknown as Config;

    mockContext = {
      config: mockConfig,
    } as unknown as AgentLoopContext;

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
          mockContext,
          { query: 'valid' },
          mockMessageBus,
        );
      }).not.toThrow();
    });

    it('accepts missing query (defaults to "Get Started!")', () => {
      expect(() => {
        new RemoteAgentInvocation(
          mockDefinition,
          mockContext,
          {},
          mockMessageBus,
        );
      }).not.toThrow();
    });

    it('uses "Get Started!" default when query is missing during execution', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);
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
        mockContext,
        {},
        mockMessageBus,
      );
      await invocation.execute({ abortSignal: new AbortController().signal });

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
          mockContext,
          { query: 123 },
          mockMessageBus,
        );
      }).toThrow("requires a string 'query' input");
    });
  });

  describe('Execution Logic', () => {
    it('should lazy load the agent without auth handler when no auth configured', async () => {
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
        mockContext,
        {
          query: 'hi',
        },
        mockMessageBus,
      );
      await invocation.execute({ abortSignal: new AbortController().signal });

      expect(mockClientManager.loadAgent).toHaveBeenCalledWith(
        'test-agent',
        { type: 'url', url: 'http://test-agent/card' },
        undefined,
      );
    });

    it('should use A2AAuthProviderFactory when auth is present in definition', async () => {
      const mockAuth = {
        type: 'http' as const,
        scheme: 'Basic' as const,
        username: 'admin',
        password: 'password',
      };
      const authDefinition: RemoteAgentDefinition = {
        ...mockDefinition,
        auth: mockAuth,
      };

      const mockHandler = {
        type: 'http' as const,
        headers: vi.fn().mockResolvedValue({ Authorization: 'Basic dGVzdA==' }),
        shouldRetryWithHeaders: vi.fn(),
      } as unknown as A2AAuthProvider;
      (A2AAuthProviderFactory.create as Mock).mockResolvedValue(mockHandler);
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
        authDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      await invocation.execute({ abortSignal: new AbortController().signal });

      expect(A2AAuthProviderFactory.create).toHaveBeenCalledWith({
        authConfig: mockAuth,
        agentName: 'test-agent',
        targetUrl: 'http://test-agent/card',
        agentCardUrl: 'http://test-agent/card',
      });
      expect(mockClientManager.loadAgent).toHaveBeenCalledWith(
        'test-agent',
        { type: 'url', url: 'http://test-agent/card' },
        mockHandler,
      );
    });

    it('should return error when auth provider factory returns undefined for configured auth', async () => {
      const authDefinition: RemoteAgentDefinition = {
        ...mockDefinition,
        auth: {
          type: 'http' as const,
          scheme: 'Bearer' as const,
          token: 'secret-token',
        },
      };

      (A2AAuthProviderFactory.create as Mock).mockResolvedValue(undefined);
      mockClientManager.getClient.mockReturnValue(undefined);

      const invocation = new RemoteAgentInvocation(
        authDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.returnDisplay).toMatchObject({ state: 'error' });
      expect((result.returnDisplay as SubagentProgress).result).toContain(
        "Failed to create auth provider for agent 'test-agent'",
      );
    });

    it('should not load the agent if already present', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);
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
        mockContext,
        {
          query: 'hi',
        },
        mockMessageBus,
      );
      await invocation.execute({ abortSignal: new AbortController().signal });

      expect(mockClientManager.loadAgent).not.toHaveBeenCalled();
    });

    it('should persist contextId and taskId across invocations', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);

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
        mockContext,
        {
          query: 'first',
        },
        mockMessageBus,
      );

      // Execute first time
      const result1 = await invocation1.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result1.returnDisplay).toMatchObject({
        result: 'Response 1',
      });
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
        mockContext,
        {
          query: 'second',
        },
        mockMessageBus,
      );
      const result2 = await invocation2.execute({
        abortSignal: new AbortController().signal,
      });
      expect((result2.returnDisplay as SubagentProgress).result).toBe(
        'Response 2',
      );

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
        mockContext,
        {
          query: 'third',
        },
        mockMessageBus,
      );
      await invocation3.execute({ abortSignal: new AbortController().signal });

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
        mockContext,
        {
          query: 'fourth',
        },
        mockMessageBus,
      );
      await invocation4.execute({ abortSignal: new AbortController().signal });

      expect(mockClientManager.sendMessageStream).toHaveBeenLastCalledWith(
        'test-agent',
        'fourth',
        { contextId: 'ctx-1', taskId: undefined, signal: expect.any(Object) }, // taskId cleared!
      );
    });

    it('should handle streaming updates and reassemble output', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);
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
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      await invocation.execute({
        abortSignal: new AbortController().signal,
        updateOutput,
      });

      expect(updateOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          isSubagentProgress: true,
          state: 'running',
          recentActivity: expect.arrayContaining([
            expect.objectContaining({ content: 'Working...' }),
          ]),
        }),
      );
      expect(updateOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          isSubagentProgress: true,
          state: 'completed',
          result: 'HelloHello World',
        }),
      );
    });

    it('should abort when signal is aborted during streaming', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);
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
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      const result = await invocation.execute({
        abortSignal: controller.signal,
      });

      expect(result.returnDisplay).toMatchObject({ state: 'error' });
    });

    it('should handle errors gracefully', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          if (Math.random() < 0) yield {} as unknown as SendMessageResult;
          throw new Error('Network error');
        },
      );

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        mockContext,
        {
          query: 'hi',
        },
        mockMessageBus,
      );
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.returnDisplay).toMatchObject({
        state: 'error',
        result: expect.stringContaining('Network error'),
      });
    });

    it('should use a2a helpers for extracting text', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);
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
        mockContext,
        {
          query: 'hi',
        },
        mockMessageBus,
      );
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      // Just check that text is present, exact formatting depends on helper
      expect((result.returnDisplay as SubagentProgress).result).toContain(
        'Extracted text',
      );
    });

    it('should handle mixed response types during streaming (TaskStatusUpdateEvent + Message)', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);
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
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
        updateOutput,
      });

      expect(updateOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          isSubagentProgress: true,
          state: 'running',
          recentActivity: expect.arrayContaining([
            expect.objectContaining({ content: 'Working...' }),
          ]),
        }),
      );
      expect(updateOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          isSubagentProgress: true,
          state: 'completed',
          result: 'Thinking...Final Answer',
        }),
      );
      expect(result.returnDisplay).toMatchObject({
        result: 'Thinking...Final Answer',
      });
    });

    it('should handle artifact reassembly with append: true', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);
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
                parts: [{ kind: 'text', text: 'Generating...' }],
              },
            },
          };
          yield {
            kind: 'artifact-update',
            taskId: 'task-1',
            contextId: 'ctx-1',
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
            contextId: 'ctx-1',
            append: true,
            artifact: {
              artifactId: 'art-1',
              parts: [{ kind: 'text', text: ' Part 2' }],
            },
          };
          return;
        },
      );

      const updateOutput = vi.fn();
      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      await invocation.execute({
        abortSignal: new AbortController().signal,
        updateOutput,
      });

      expect(updateOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          isSubagentProgress: true,
          state: 'running',
          recentActivity: expect.arrayContaining([
            expect.objectContaining({ content: 'Working...' }),
          ]),
        }),
      );
      expect(updateOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          isSubagentProgress: true,
          state: 'completed',
          result: 'Generating...\n\nArtifact (Result):\nPart 1 Part 2',
        }),
      );
    });
  });

  describe('Confirmations', () => {
    it('should return info confirmation details', async () => {
      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        mockContext,
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

  describe('Error Handling', () => {
    it('should use A2AAgentError.userMessage for structured errors', async () => {
      const { AgentConnectionError } = await import('./a2a-errors.js');
      const a2aError = new AgentConnectionError(
        'test-agent',
        'http://test-agent/card',
        new Error('ECONNREFUSED'),
      );

      mockClientManager.getClient.mockReturnValue(undefined);
      mockClientManager.loadAgent.mockRejectedValue(a2aError);

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.returnDisplay).toMatchObject({ state: 'error' });
      expect((result.returnDisplay as SubagentProgress).result).toContain(
        a2aError.userMessage,
      );
    });

    it('should use generic message for non-A2AAgentError errors', async () => {
      mockClientManager.getClient.mockReturnValue(undefined);
      mockClientManager.loadAgent.mockRejectedValue(
        new Error('something unexpected'),
      );

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.returnDisplay).toMatchObject({ state: 'error' });
      expect((result.returnDisplay as SubagentProgress).result).toContain(
        'Error calling remote agent: something unexpected',
      );
    });

    it('should include partial output when error occurs mid-stream', async () => {
      mockClientManager.getClient.mockReturnValue(mockClient);
      mockClientManager.sendMessageStream.mockImplementation(
        async function* () {
          yield {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Partial response' }],
          };
          // Raw errors propagate from the A2A SDK — no wrapping or classification.
          throw new Error('connection reset');
        },
      );

      const invocation = new RemoteAgentInvocation(
        mockDefinition,
        mockContext,
        { query: 'hi' },
        mockMessageBus,
      );
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });

      expect(result.returnDisplay).toMatchObject({ state: 'error' });
      // Should contain both the partial output and the error message
      expect(result.returnDisplay).toMatchObject({
        result: expect.stringContaining('Partial response'),
      });
      expect(result.returnDisplay).toMatchObject({
        result: expect.stringContaining('connection reset'),
      });
    });
  });
});
