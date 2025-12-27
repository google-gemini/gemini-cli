/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolWithHooks } from './coreToolHookTriggers.js';
import { BaseToolInvocation, type ToolResult } from '../tools/tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import {
  MessageBusType,
  type HookExecutionResponse,
} from '../confirmation-bus/types.js';

class MockInvocation extends BaseToolInvocation<{ key: string }, ToolResult> {
  constructor(params: { key: string }) {
    super(params);
  }
  getDescription() {
    return 'mock';
  }
  async execute() {
    return {
      llmContent: `key: ${this.params.key}`,
      returnDisplay: `key: ${this.params.key}`,
    };
  }
}

describe('executeToolWithHooks', () => {
  let messageBus: MessageBus;

  beforeEach(() => {
    messageBus = {
      request: vi.fn(),
    } as unknown as MessageBus;
  });

  it('should apply modified tool input from BeforeTool hook', async () => {
    const params = { key: 'original' };
    const invocation = new MockInvocation(params);
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
    );

    // Verify result reflects modified input
    expect(result.llmContent).toBe(
      'key: modified\n\n[System] Tool input parameters (key) were modified by a hook before execution.',
    );
    // Verify params object was modified in place
    expect(invocation.params.key).toBe('modified');

    expect(requestSpy).toHaveBeenCalled();
  });

  it('should not modify input if hook does not provide tool_input', async () => {
    const params = { key: 'original' };
    const invocation = new MockInvocation(params);
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
    );

    expect(result.llmContent).toBe('key: original');
    expect(invocation.params.key).toBe('original');
  });
});
