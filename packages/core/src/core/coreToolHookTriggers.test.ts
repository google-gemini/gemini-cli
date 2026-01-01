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
  constructor(params: { key?: string }) {
    super(params);
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
      build: vi.fn().mockImplementation((params) => new MockInvocation(params)),
    } as unknown as AnyDeclarativeTool;
  });

  // Note: BeforeTool hook is now fired in CoreToolScheduler._processNextInQueue
  // The following tests only test AfterTool hook behavior in executeToolWithHooks

  it('should handle continue: false in AfterTool', async () => {
    const invocation = new MockInvocation({});
    const abortSignal = new AbortController().signal;
    const spy = vi.spyOn(invocation, 'execute');

    // Only AfterTool hook is fired from executeToolWithHooks now
    vi.mocked(messageBus.request).mockResolvedValueOnce({
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
    const invocation = new MockInvocation({});
    const abortSignal = new AbortController().signal;

    // Only AfterTool hook is fired from executeToolWithHooks now
    vi.mocked(messageBus.request).mockResolvedValueOnce({
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

  it('should execute tool when hooks are disabled', async () => {
    const invocation = new MockInvocation({ key: 'test' });
    const abortSignal = new AbortController().signal;

    const result = await executeToolWithHooks(
      invocation,
      'test_tool',
      abortSignal,
      messageBus,
      false, // hooksEnabled = false
      mockTool,
    );

    expect(result.llmContent).toBe('key: test');
    expect(messageBus.request).not.toHaveBeenCalled();
  });

  it('should add additional context from AfterTool hook', async () => {
    const invocation = new MockInvocation({ key: 'test' });
    const abortSignal = new AbortController().signal;

    vi.mocked(messageBus.request).mockResolvedValueOnce({
      type: MessageBusType.HOOK_EXECUTION_RESPONSE,
      correlationId: 'test-id',
      success: true,
      output: {
        hookSpecificOutput: {
          additionalContext: 'Extra info from hook',
        },
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

    expect(result.llmContent).toBe('key: test\n\nExtra info from hook');
  });
});
