/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { RemoteAgentInvocation } from './remote-invocation.js';
import { A2AClientManager } from './a2a-client-manager.js';
import type { RemoteAgentDefinition } from './types.js';

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

  beforeEach(() => {
    vi.clearAllMocks();
    (A2AClientManager.getInstance as Mock).mockReturnValue(mockClientManager);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should lazy load the agent if not present', async () => {
    mockClientManager.getClient.mockReturnValue(undefined);
    mockClientManager.sendMessage.mockResolvedValue({
      result: { kind: 'message', parts: [{ kind: 'text', text: 'Hello' }] },
    });

    const invocation = new RemoteAgentInvocation(mockDefinition, { query: 'hi' });
    await invocation.execute(new AbortController().signal);

    expect(mockClientManager.loadAgent).toHaveBeenCalledWith(
      'test-agent',
      'http://test-agent/card',
    );
  });

  it('should not load the agent if already present', async () => {
    mockClientManager.getClient.mockReturnValue({});
    mockClientManager.sendMessage.mockResolvedValue({
      result: { kind: 'message', parts: [{ kind: 'text', text: 'Hello' }] },
    });

    const invocation = new RemoteAgentInvocation(mockDefinition, { query: 'hi' });
    await invocation.execute(new AbortController().signal);

    expect(mockClientManager.loadAgent).not.toHaveBeenCalled();
  });

  it('should maintain contextId and taskId across calls', async () => {
    mockClientManager.getClient.mockReturnValue({});

    // First call return values
    mockClientManager.sendMessage.mockResolvedValueOnce({
      result: { kind: 'message', parts: [{ kind: 'text', text: 'Response 1' }] },
      contextId: 'ctx-1',
      taskId: 'task-1',
    });

    const invocation = new RemoteAgentInvocation(mockDefinition, { query: 'first' });

    // Execute first time
    const result1 = await invocation.execute(new AbortController().signal);
    expect(result1.returnDisplay).toBe('Response 1');
    expect(mockClientManager.sendMessage).toHaveBeenLastCalledWith(
      'test-agent',
      'first',
      { contextId: undefined, taskId: undefined },
    );

    // Prepare for second call with simulated state persistence
    mockClientManager.sendMessage.mockResolvedValueOnce({
      result: { kind: 'message', parts: [{ kind: 'text', text: 'Response 2' }] },
      contextId: 'ctx-1',
      taskId: 'task-2',
    });

    const result2 = await invocation.execute(new AbortController().signal);
    expect(result2.returnDisplay).toBe('Response 2');

    expect(mockClientManager.sendMessage).toHaveBeenLastCalledWith(
      'test-agent',
      'first', // Params same
      { contextId: 'ctx-1', taskId: 'task-1' }, // Used state from first call
    );
  });

  it('should handle errors gracefully', async () => {
    mockClientManager.getClient.mockReturnValue({});
    mockClientManager.sendMessage.mockRejectedValue(new Error('Network error'));

    const invocation = new RemoteAgentInvocation(mockDefinition, { query: 'hi' });
    const result = await invocation.execute(new AbortController().signal);

    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('Network error');
  });

  it('should use a2a helpers for extracting text', async () => {
     mockClientManager.getClient.mockReturnValue({});
     // Mock a complex message part that needs extraction
     mockClientManager.sendMessage.mockResolvedValue({
      result: {
        kind: 'message',
        parts: [
            { kind: 'text', text: 'Extracted text' },
            { kind: 'data', data: { foo: 'bar' } }
        ]
      },
    });

    const invocation = new RemoteAgentInvocation(mockDefinition, { query: 'hi' });
    const result = await invocation.execute(new AbortController().signal);

    // Just check that text is present, exact formatting depends on helper
    expect(result.returnDisplay).toContain('Extracted text');
  });

  describe('input mapping', () => {
    it('should use "query" param if present', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessage.mockResolvedValue({
        result: { kind: 'message', parts: [{ kind: 'text', text: 'OK' }] },
      });

      const invocation = new RemoteAgentInvocation(mockDefinition, {
        query: 'my query',
        other: 'ignored',
      });
      await invocation.execute(new AbortController().signal);

      expect(mockClientManager.sendMessage).toHaveBeenCalledWith(
        'test-agent',
        'my query',
        expect.any(Object),
      );
    });

    it('should use single string param if present', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessage.mockResolvedValue({
        result: { kind: 'message', parts: [{ kind: 'text', text: 'OK' }] },
      });

      const invocation = new RemoteAgentInvocation(mockDefinition, {
        single: 'single value',
      });
      await invocation.execute(new AbortController().signal);

      expect(mockClientManager.sendMessage).toHaveBeenCalledWith(
        'test-agent',
        'single value',
        expect.any(Object),
      );
    });

    it('should format multiple params as key-value pairs', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessage.mockResolvedValue({
        result: { kind: 'message', parts: [{ kind: 'text', text: 'OK' }] },
      });

      const invocation = new RemoteAgentInvocation(mockDefinition, {
        topic: 'foo',
        count: 5,
      });
      await invocation.execute(new AbortController().signal);

      expect(mockClientManager.sendMessage).toHaveBeenCalledWith(
        'test-agent',
        'topic: foo\ncount: 5',
        expect.any(Object),
      );
    });

    it('should fallback to JSON for complex params', async () => {
      mockClientManager.getClient.mockReturnValue({});
      mockClientManager.sendMessage.mockResolvedValue({
        result: { kind: 'message', parts: [{ kind: 'text', text: 'OK' }] },
      });

      const complexParam = { nested: { key: 'value' } };
      const invocation = new RemoteAgentInvocation(mockDefinition, {
        complex: complexParam,
      });
      await invocation.execute(new AbortController().signal);

      expect(mockClientManager.sendMessage).toHaveBeenCalledWith(
        'test-agent',
        JSON.stringify({ complex: complexParam }),
        expect.any(Object),
      );
    });
  });
});
