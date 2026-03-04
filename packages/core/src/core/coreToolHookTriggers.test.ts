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
import type { HookSystem } from '../hooks/hookSystem.js';
import type { Config } from '../config/config.js';
import { type DefaultHookOutput } from '../hooks/types.js';

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
  let mockHookSystem: HookSystem;
  let mockConfig: Config;

  beforeEach(() => {
    messageBus = {
      request: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
    mockHookSystem = {
      fireBeforeToolEvent: vi.fn(),
      fireAfterToolEvent: vi.fn(),
    } as unknown as HookSystem;
    mockConfig = {
      getHookSystem: vi.fn().mockReturnValue(mockHookSystem),
      getMcpClientManager: vi.fn().mockReturnValue(undefined),
      getMcpServers: vi.fn().mockReturnValue({}),
    } as unknown as Config;
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

    vi.mocked(mockHookSystem.fireAfterToolEvent).mockResolvedValue({
      shouldStopExecution: () => true,
      getEffectiveReason: () => 'Stop after execution',
      getBlockingError: () => ({ blocked: false, reason: '' }),
    } as unknown as DefaultHookOutput);

    const result = await executeToolWithHooks(
      invocation,
      'test_tool',
      abortSignal,
      mockTool,
      undefined,
      undefined,
      undefined,
      mockConfig,
    );

    expect(result.error?.type).toBe(ToolErrorType.STOP_EXECUTION);
    expect(result.error?.message).toBe('Stop after execution');
    expect(spy).toHaveBeenCalled();
  });

  it('should block result in AfterTool if decision is deny', async () => {
    const invocation = new MockInvocation({}, messageBus);
    const abortSignal = new AbortController().signal;

    vi.mocked(mockHookSystem.fireAfterToolEvent).mockResolvedValue({
      shouldStopExecution: () => false,
      getEffectiveReason: () => '',
      getBlockingError: () => ({ blocked: true, reason: 'Result denied' }),
    } as unknown as DefaultHookOutput);

    const result = await executeToolWithHooks(
      invocation,
      'test_tool',
      abortSignal,
      mockTool,
      undefined,
      undefined,
      undefined,
      mockConfig,
    );

    expect(result.error?.type).toBe(ToolErrorType.EXECUTION_FAILED);
    expect(result.error?.message).toBe('Result denied');
  });
});
