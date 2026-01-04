/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolWithHooks } from './coreToolHookTriggers.js';
import { ToolErrorType } from '../tools/tool-error.js';
import {
  BaseToolInvocation,
  type ToolResult,
  type AnyDeclarativeTool,
} from '../tools/tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type HookExecutionResponse,
} from '../confirmation-bus/types.js';

class MockInvocation extends BaseToolInvocation<{ key?: string }, ToolResult> {
  constructor(params: { key?: string }, messageBus: MessageBus) {
    super(params, messageBus);
  }
  getDescription() {
    return 'mock';
  }
  async execute() {
    return {
      llmContent: this.params.key ? `key: ${this.params.key}` : 'success',
      returnDisplay: this.params.key
        ? `key: ${this.params.key}`
        : 'success display',
    };
  }
}

describe('executeToolWithHooks', () => {
  let messageBus: MessageBus;
  let mockTool: AnyDeclarativeTool;

  beforeEach(() => {
    messageBus = {
      request: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
    mockTool = {
      build: vi
        .fn()
        .mockImplementation((params) => new MockInvocation(params, messageBus)),
    } as unknown as AnyDeclarativeTool;
  });

  it('should prioritize continue: false over decision: block in BeforeTool', async () => {
    const invocation = new MockInvocation({}, messageBus);
    const abortSignal = new AbortController().signal;

    vi.mocked(messageBus.request).mockResolvedValue({
      type: MessageBusType.HOOK_EXECUTION_RESPONSE,
      correlationId: 'test-id',
      success: true,
      output: {
        continue: false,
        stopReason: 'Stop immediately',
        decision: 'block',
        reason: 'Should be ignored because continue is false',
      },
    } as HookExecutionResponse);

    const result = await executeToolWithHooks(
      invocation,
      'test_tool',
      abortSignal,
      messageBus,
      true,
      mockTool,
    );

    expect(result.error?.type).toBe(ToolErrorType.STOP_EXECUTION);
    expect(result.error?.message).toBe('Stop immediately');
  });

  it('should block execution in BeforeTool if decision is block', async () => {
    const invocation = new MockInvocation({}, messageBus);
    const abortSignal = new AbortController().signal;

    vi.mocked(messageBus.request).mockResolvedValue({
      type: MessageBusType.HOOK_EXECUTION_RESPONSE,
      correlationId: 'test-id',
      success: true,
      output: {
        decision: 'block',
        reason: 'Execution blocked',
      },
    } as HookExecutionResponse);

    const result = await executeToolWithHooks(
      invocation,
      'test_tool',
      abortSignal,
      messageBus,
      true,
      mockTool,
    );

    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.error?.message).toBe('Execution blocked');
  });

  it('should handle continue: false in AfterTool', async () => {
    const invocation = new MockInvocation({}, messageBus);
    const abortSignal = new AbortController().signal;
    const spy = vi.spyOn(invocation, 'execute');

    // BeforeTool allow
    vi.mocked(messageBus.request)
      .mockResolvedValueOnce({
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: 'test-id',
        success: true,
        output: { decision: 'allow' },
      } as HookExecutionResponse)
      // AfterTool stop
      .mockResolvedValueOnce({
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: 'test-id',
        success: true,
        output: {
          continue: false,
          stopReason: 'Stop after execution',
        },
      } as HookExecutionResponse);

    const result = await executeToolWithHooks(
      invocation,
      'test_tool',
      abortSignal,
      messageBus,
      true,
      mockTool,
    );

    expect(result.error?.type).toBe(ToolErrorType.STOP_EXECUTION);
    expect(result.error?.message).toBe('Stop after execution');
    expect(spy).toHaveBeenCalled();
  });

  it('should block result in AfterTool if decision is deny', async () => {
    const invocation = new MockInvocation({}, messageBus);
    const abortSignal = new AbortController().signal;

    // BeforeTool allow
    vi.mocked(messageBus.request)
      .mockResolvedValueOnce({
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: 'test-id',
        success: true,
        output: { decision: 'allow' },
      } as HookExecutionResponse)
      // AfterTool deny
      .mockResolvedValueOnce({
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: 'test-id',
        success: true,
        output: {
          decision: 'deny',
          reason: 'Result denied',
        },
      } as HookExecutionResponse);

    const result = await executeToolWithHooks(
      invocation,
      'test_tool',
      abortSignal,
      messageBus,
      true,
      mockTool,
    );

    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.error?.message).toBe('Result denied');
  });

  it('should apply modified tool input from BeforeTool hook', async () => {
    const params = { key: 'original' };
    const invocation = new MockInvocation(params, messageBus);
    const toolName = 'test-tool';
    const abortSignal = new AbortController().signal;

    // Capture arguments to verify what was passed before modification
    const requestSpy = vi.fn().mockImplementation(async (request) => {
      if (request.eventName === 'BeforeTool') {
        // Verify input is original before we return modification instruction
        expect(request.input.tool_input.key).toBe('original');
        return {
          type: MessageBusType.HOOK_EXECUTION_RESPONSE,
          correlationId: 'test-id',
          success: true,
          output: {
            hookSpecificOutput: {
              hookEventName: 'BeforeTool',
              tool_input: { key: 'modified' },
            },
          },
        } as HookExecutionResponse;
      }
      return {
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: 'test-id',
        success: true,
        output: {},
      } as HookExecutionResponse;
    });
    messageBus.request = requestSpy;

    const result = await executeToolWithHooks(
      invocation,
      toolName,
      abortSignal,
      messageBus,
      true, // hooksEnabled
      mockTool,
    );

    // Verify result reflects modified input
    expect(result.llmContent).toBe(
      'key: modified\n\n[System] Tool input parameters (key) were modified by a hook before execution.',
    );
    // Verify params object was modified in place
    expect(invocation.params.key).toBe('modified');

    expect(requestSpy).toHaveBeenCalled();
    expect(mockTool.build).toHaveBeenCalledWith({ key: 'modified' });
  });

  it('should not modify input if hook does not provide tool_input', async () => {
    const params = { key: 'original' };
    const invocation = new MockInvocation(params, messageBus);
    const toolName = 'test-tool';
    const abortSignal = new AbortController().signal;

    vi.mocked(messageBus.request).mockResolvedValue({
      type: MessageBusType.HOOK_EXECUTION_RESPONSE,
      correlationId: 'test-id',
      success: true,
      output: {
        hookSpecificOutput: {
          hookEventName: 'BeforeTool',
          // No tool_input
        },
      },
    } as HookExecutionResponse);

    const result = await executeToolWithHooks(
      invocation,
      toolName,
      abortSignal,
      messageBus,
      true, // hooksEnabled
      mockTool,
    );

    expect(result.llmContent).toBe('key: original');
    expect(invocation.params.key).toBe('original');
    expect(mockTool.build).not.toHaveBeenCalled();
  });
});
