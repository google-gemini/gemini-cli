/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolWithHooks } from './coreToolHookTriggers.js';
import { ToolErrorType } from '../tools/tool-error.js';
import type { AnyToolInvocation } from '../tools/tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { HookExecutionResponse } from '../confirmation-bus/types.js';

describe('coreToolHookTriggers - Two-Stage Validation', () => {
  const mockInvocation = {
    params: {},
    execute: vi.fn().mockResolvedValue({
      llmContent: 'success',
      returnDisplay: 'success',
    }),
  } as unknown as AnyToolInvocation;
  const toolName = 'test-tool';
  const signal = new AbortController().signal;
  const messageBus = {
    request: vi.fn(),
  } as unknown as MessageBus;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('BeforeTool Stage 1: should return PERMISSION_DENIED when isBlockingDecision is true', async () => {
    vi.mocked(messageBus.request).mockResolvedValue({
      output: {
        decision: 'block',
        reason: 'Security violation',
      },
    } as unknown as HookExecutionResponse);

    const result = await executeToolWithHooks(
      mockInvocation,
      toolName,
      signal,
      messageBus,
      true,
    );

    expect(result.error?.type).toBe(ToolErrorType.PERMISSION_DENIED);
    expect(result.llmContent).toContain('Policy Block: Security violation');
  });

  it('BeforeTool Stage 2: should return EXECUTION_FAILED when shouldStopExecution is true', async () => {
    vi.mocked(messageBus.request).mockResolvedValue({
      output: {
        continue: false,
        stopReason: 'Manual stop',
      },
    } as unknown as HookExecutionResponse);

    const result = await executeToolWithHooks(
      mockInvocation,
      toolName,
      signal,
      messageBus,
      true,
    );

    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.llmContent).toContain('Execution stopped: Manual stop');
  });

  it('AfterTool: should return EXECUTION_FAILED when shouldStopExecution is true', async () => {
    // BeforeTool (allow)
    vi.mocked(messageBus.request).mockResolvedValueOnce({
      output: {},
    } as unknown as HookExecutionResponse);
    // AfterTool (stop)
    vi.mocked(messageBus.request).mockResolvedValueOnce({
      output: {
        continue: false,
        stopReason: 'Halt after execution',
      },
    } as unknown as HookExecutionResponse);

    const result = await executeToolWithHooks(
      mockInvocation,
      toolName,
      signal,
      messageBus,
      true,
    );

    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.llmContent).toContain(
      'Execution stopped: Halt after execution',
    );
  });
});
