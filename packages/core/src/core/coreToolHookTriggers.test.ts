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

  it('should handle continue: false in AfterTool', async () => {
    const invocation = new MockInvocation({}, messageBus);
    const abortSignal = new AbortController().signal;
    const spy = vi.spyOn(invocation, 'execute');

    // AfterTool stop
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
    const invocation = new MockInvocation({}, messageBus);
    const abortSignal = new AbortController().signal;

    // AfterTool deny
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

  it('should append modification message if inputModification is provided', async () => {
    const params = { key: 'modified' };
    const invocation = new MockInvocation(params, messageBus);
    const toolName = 'test-tool';
    const abortSignal = new AbortController().signal;

    vi.mocked(messageBus.request).mockResolvedValue({
      type: MessageBusType.HOOK_EXECUTION_RESPONSE,
      correlationId: 'test-id',
      success: true,
      output: {},
    } as HookExecutionResponse);

    const result = await executeToolWithHooks(
      invocation,
      toolName,
      abortSignal,
      messageBus,
      true, // hooksEnabled
      mockTool,
      undefined,
      undefined,
      undefined,
      undefined, // config
      { wasModified: true, modifiedKeys: ['key'] }, // inputModification
    );

    // Verify result reflects modified input message
    expect(result.llmContent).toBe(
      'key: modified\n\n[System] Tool input parameters (key) were modified by a hook before execution.',
    );
  });
});
