/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolWithHooks } from './coreToolHookTriggers.js';
import { ToolErrorType } from '../tools/tool-error.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { AnyToolInvocation } from '../tools/tools.js';

describe('executeToolWithHooks', () => {
  let mockMessageBus: MessageBus;
  let mockInvocation: AnyToolInvocation;
  let abortSignal: AbortSignal;

  beforeEach(() => {
    mockMessageBus = {
      request: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;

    mockInvocation = {
      params: {},
      execute: vi.fn().mockResolvedValue({
        llmContent: 'success',
        returnDisplay: 'success display',
      }),
      getDescription: vi.fn().mockReturnValue('mock tool'),
      toolLocations: vi.fn().mockReturnValue([]),
      shouldConfirmExecute: vi.fn().mockResolvedValue(false),
    } as unknown as AnyToolInvocation;

    abortSignal = new AbortController().signal;
  });

  it('should prioritize continue: false over decision: block in BeforeTool', async () => {
    vi.mocked(mockMessageBus.request).mockResolvedValue({
      type: MessageBusType.HOOK_EXECUTION_RESPONSE,
      correlationId: 'test-id',
      success: true,
      output: {
        continue: false,
        stopReason: 'Stop immediately',
        decision: 'block',
        reason: 'Should be ignored because continue is false',
      },
    });

    const result = await executeToolWithHooks(
      mockInvocation,
      'test_tool',
      abortSignal,
      mockMessageBus,
      true,
    );

    expect(result.error?.type).toBe(ToolErrorType.STOP_EXECUTION);
    expect(result.error?.message).toBe('Stop immediately');
    expect(mockInvocation.execute).not.toHaveBeenCalled();
  });

  it('should block execution in BeforeTool if decision is block', async () => {
    vi.mocked(mockMessageBus.request).mockResolvedValue({
      type: MessageBusType.HOOK_EXECUTION_RESPONSE,
      correlationId: 'test-id',
      success: true,
      output: {
        decision: 'block',
        reason: 'Execution blocked',
      },
    });

    const result = await executeToolWithHooks(
      mockInvocation,
      'test_tool',
      abortSignal,
      mockMessageBus,
      true,
    );

    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.error?.message).toBe('Execution blocked');
    expect(mockInvocation.execute).not.toHaveBeenCalled();
  });

  it('should handle continue: false in AfterTool', async () => {
    // BeforeTool allow
    vi.mocked(mockMessageBus.request)
      .mockResolvedValueOnce({
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: 'test-id',
        success: true,
        output: { decision: 'allow' },
      })
      // AfterTool stop
      .mockResolvedValueOnce({
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: 'test-id',
        success: true,
        output: {
          continue: false,
          stopReason: 'Stop after execution',
        },
      });

    const result = await executeToolWithHooks(
      mockInvocation,
      'test_tool',
      abortSignal,
      mockMessageBus,
      true,
    );

    expect(result.error?.type).toBe(ToolErrorType.STOP_EXECUTION);
    expect(result.error?.message).toBe('Stop after execution');
    expect(mockInvocation.execute).toHaveBeenCalled();
  });

  it('should block result in AfterTool if decision is deny', async () => {
    // BeforeTool allow
    vi.mocked(mockMessageBus.request)
      .mockResolvedValueOnce({
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: 'test-id',
        success: true,
        output: { decision: 'allow' },
      })
      // AfterTool deny
      .mockResolvedValueOnce({
        type: MessageBusType.HOOK_EXECUTION_RESPONSE,
        correlationId: 'test-id',
        success: true,
        output: {
          decision: 'deny',
          reason: 'Result denied',
        },
      });

    const result = await executeToolWithHooks(
      mockInvocation,
      'test_tool',
      abortSignal,
      mockMessageBus,
      true,
    );

    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.error?.message).toBe('Result denied');
    expect(mockInvocation.execute).toHaveBeenCalled();
  });

  it('should execute tool normally if hooks allow', async () => {
    vi.mocked(mockMessageBus.request).mockResolvedValue({
      type: MessageBusType.HOOK_EXECUTION_RESPONSE,
      correlationId: 'test-id',
      success: true,
      output: { decision: 'allow' },
    });

    const result = await executeToolWithHooks(
      mockInvocation,
      'test_tool',
      abortSignal,
      mockMessageBus,
      true,
    );

    expect(result.llmContent).toBe('success');
    expect(result.error).toBeUndefined();
    expect(mockInvocation.execute).toHaveBeenCalled();
  });
});
