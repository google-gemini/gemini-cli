/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolExecutor } from './tool-executor.js';
import {
  type Config,
  type ToolResult,
  type AnyToolInvocation,
} from '../index.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { MockTool } from '../test-utils/mock-tool.js';
import type { ScheduledToolCall } from './types.js';
import { CoreToolCallStatus } from './types.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import * as fileUtils from '../utils/fileUtils.js';
import * as coreToolHookTriggers from '../core/coreToolHookTriggers.js';
import { ShellToolInvocation } from '../tools/shell.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import {
  GeminiCliOperation,
  GEN_AI_TOOL_CALL_ID,
  GEN_AI_TOOL_DESCRIPTION,
  GEN_AI_TOOL_NAME,
} from '../telemetry/constants.js';

// Mock file utils
vi.mock('../utils/fileUtils.js', () => ({
  saveTruncatedToolOutput: vi.fn(),
  formatTruncatedToolOutput: vi.fn(),
}));

// Mock executeToolWithHooks
vi.mock('../core/coreToolHookTriggers.js', () => ({
  executeToolWithHooks: vi.fn(),
}));
// Mock runInDevTraceSpan
const runInDevTraceSpan = vi.hoisted(() =>
  vi.fn(async (opts, fn) => {
    const metadata = { attributes: opts.attributes || {} };
    return fn({
      metadata,
      endSpan: vi.fn(),
    });
  }),
);

vi.mock('../index.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    runInDevTraceSpan,
  };
});

describe('ToolExecutor', () => {
  let config: Config;
  let executor: ToolExecutor;

  beforeEach(() => {
    // Use the standard fake config factory
    config = makeFakeConfig();
    executor = new ToolExecutor(config);

    // Reset mocks
    vi.resetAllMocks();

    // Default mock implementation
    vi.mocked(fileUtils.saveTruncatedToolOutput).mockResolvedValue({
      outputFile: '/tmp/truncated_output.txt',
    });
    vi.mocked(fileUtils.formatTruncatedToolOutput).mockReturnValue(
      'TruncatedContent...',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute a tool successfully', async () => {
    const mockTool = new MockTool({
      name: 'testTool',
      description: 'Mock description',
      execute: async () => ({
        llmContent: 'Tool output',
        returnDisplay: 'Tool output',
      }),
    });
    const invocation = mockTool.build({});

    // Mock executeToolWithHooks to return success
    vi.mocked(coreToolHookTriggers.executeToolWithHooks).mockResolvedValue({
      llmContent: 'Tool output',
      returnDisplay: 'Tool output',
    } as ToolResult);

    const scheduledCall: ScheduledToolCall = {
      status: CoreToolCallStatus.Scheduled,
      request: {
        callId: 'call-1',
        name: 'testTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-1',
      },
      tool: mockTool,
      invocation: invocation as unknown as AnyToolInvocation,
      startTime: Date.now(),
    };

    const onUpdateToolCall = vi.fn();
    const result = await executor.execute({
      call: scheduledCall,
      signal: new AbortController().signal,
      onUpdateToolCall,
    });

    expect(result.status).toBe(CoreToolCallStatus.Success);
    if (result.status === CoreToolCallStatus.Success) {
      const response = result.response.responseParts[0]?.functionResponse
        ?.response as Record<string, unknown>;
      expect(response).toEqual({ output: 'Tool output' });
    }

    expect(runInDevTraceSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: GeminiCliOperation.ToolCall,
        attributes: expect.objectContaining({
          [GEN_AI_TOOL_NAME]: 'testTool',
          [GEN_AI_TOOL_CALL_ID]: 'call-1',
          [GEN_AI_TOOL_DESCRIPTION]: 'Mock description',
        }),
      }),
      expect.any(Function),
    );

    const spanArgs = vi.mocked(runInDevTraceSpan).mock.calls[0];
    const fn = spanArgs[1];
    const metadata = { attributes: {} };
    await fn({ metadata, endSpan: vi.fn() });
    expect(metadata).toMatchObject({
      input: scheduledCall.request,
      output: {
        ...result,
        durationMs: expect.any(Number),
        endTime: expect.any(Number),
      },
    });
  });

  it('should handle execution errors', async () => {
    const mockTool = new MockTool({
      name: 'failTool',
      description: 'Mock description',
    });
    const invocation = mockTool.build({});

    // Mock executeToolWithHooks to throw
    vi.mocked(coreToolHookTriggers.executeToolWithHooks).mockRejectedValue(
      new Error('Tool Failed'),
    );

    const scheduledCall: ScheduledToolCall = {
      status: CoreToolCallStatus.Scheduled,
      request: {
        callId: 'call-2',
        name: 'failTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-2',
      },
      tool: mockTool,
      invocation: invocation as unknown as AnyToolInvocation,
      startTime: Date.now(),
    };

    const result = await executor.execute({
      call: scheduledCall,
      signal: new AbortController().signal,
      onUpdateToolCall: vi.fn(),
    });

    expect(result.status).toBe(CoreToolCallStatus.Error);
    if (result.status === CoreToolCallStatus.Error) {
      expect(result.response.error?.message).toBe('Tool Failed');
    }

    expect(runInDevTraceSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: GeminiCliOperation.ToolCall,
        attributes: expect.objectContaining({
          [GEN_AI_TOOL_NAME]: 'failTool',
          [GEN_AI_TOOL_CALL_ID]: 'call-2',
          [GEN_AI_TOOL_DESCRIPTION]: 'Mock description',
        }),
      }),
      expect.any(Function),
    );

    const spanArgs = vi.mocked(runInDevTraceSpan).mock.calls[0];
    const fn = spanArgs[1];
    const metadata = { attributes: {} };
    await fn({ metadata, endSpan: vi.fn() });
    expect(metadata).toMatchObject({
      error: new Error('Tool Failed'),
    });
  });

  it('should return cancelled result when signal is aborted', async () => {
    const mockTool = new MockTool({
      name: 'slowTool',
    });
    const invocation = mockTool.build({});

    // Mock executeToolWithHooks to simulate slow execution or cancellation check
    vi.mocked(coreToolHookTriggers.executeToolWithHooks).mockImplementation(
      async () => {
        await new Promise((r) => setTimeout(r, 100));
        return { llmContent: 'Done', returnDisplay: 'Done' };
      },
    );

    const scheduledCall: ScheduledToolCall = {
      status: CoreToolCallStatus.Scheduled,
      request: {
        callId: 'call-3',
        name: 'slowTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-3',
      },
      tool: mockTool,
      invocation: invocation as unknown as AnyToolInvocation,
      startTime: Date.now(),
    };

    const controller = new AbortController();
    const promise = executor.execute({
      call: scheduledCall,
      signal: controller.signal,
      onUpdateToolCall: vi.fn(),
    });

    controller.abort();
    const result = await promise;

    expect(result.status).toBe(CoreToolCallStatus.Cancelled);
  });

  it('should truncate large shell output', async () => {
    // 1. Setup Config for Truncation
    vi.spyOn(config, 'getTruncateToolOutputThreshold').mockReturnValue(10);
    vi.spyOn(config.storage, 'getProjectTempDir').mockReturnValue('/tmp');

    const mockTool = new MockTool({ name: SHELL_TOOL_NAME });
    const invocation = mockTool.build({});
    const longOutput = 'This is a very long output that should be truncated.';

    // 2. Mock execution returning long content
    vi.mocked(coreToolHookTriggers.executeToolWithHooks).mockResolvedValue({
      llmContent: longOutput,
      returnDisplay: longOutput,
    });

    const scheduledCall: ScheduledToolCall = {
      status: CoreToolCallStatus.Scheduled,
      request: {
        callId: 'call-trunc',
        name: SHELL_TOOL_NAME,
        args: { command: 'echo long' },
        isClientInitiated: false,
        prompt_id: 'prompt-trunc',
      },
      tool: mockTool,
      invocation: invocation as unknown as AnyToolInvocation,
      startTime: Date.now(),
    };

    // 3. Execute
    const result = await executor.execute({
      call: scheduledCall,
      signal: new AbortController().signal,
      onUpdateToolCall: vi.fn(),
    });

    // 4. Verify Truncation Logic
    expect(fileUtils.saveTruncatedToolOutput).toHaveBeenCalledWith(
      longOutput,
      SHELL_TOOL_NAME,
      'call-trunc',
      expect.any(String), // temp dir
      'test-session-id', // session id from makeFakeConfig
    );

    expect(fileUtils.formatTruncatedToolOutput).toHaveBeenCalledWith(
      longOutput,
      '/tmp/truncated_output.txt',
      10, // threshold (maxChars)
    );

    expect(result.status).toBe(CoreToolCallStatus.Success);
    if (result.status === CoreToolCallStatus.Success) {
      const response = result.response.responseParts[0]?.functionResponse
        ?.response as Record<string, unknown>;
      // The content should be the *truncated* version returned by the mock formatTruncatedToolOutput
      expect(response).toEqual({ output: 'TruncatedContent...' });
      expect(result.response.outputFile).toBe('/tmp/truncated_output.txt');
    }
  });

  it('should report PID updates for shell tools', async () => {
    // 1. Setup ShellToolInvocation
    const messageBus = createMockMessageBus();
    const shellInvocation = new ShellToolInvocation(
      config,
      { command: 'sleep 10' },
      messageBus,
    );
    // We need a dummy tool that matches the invocation just for structure
    const mockTool = new MockTool({ name: SHELL_TOOL_NAME });

    // 2. Mock executeToolWithHooks to trigger the PID callback
    const testPid = 12345;
    vi.mocked(coreToolHookTriggers.executeToolWithHooks).mockImplementation(
      async (
        _inv,
        _name,
        _sig,
        _tool,
        _liveCb,
        _shellCfg,
        setPidCallback,
        _config,
        _originalRequestName,
      ) => {
        // Simulate the shell tool reporting a PID
        if (setPidCallback) {
          setPidCallback(testPid);
        }
        return { llmContent: 'done', returnDisplay: 'done' };
      },
    );

    const scheduledCall: ScheduledToolCall = {
      status: CoreToolCallStatus.Scheduled,
      request: {
        callId: 'call-pid',
        name: SHELL_TOOL_NAME,
        args: { command: 'sleep 10' },
        isClientInitiated: false,
        prompt_id: 'prompt-pid',
      },
      tool: mockTool,
      invocation: shellInvocation,
      startTime: Date.now(),
    };

    const onUpdateToolCall = vi.fn();

    // 3. Execute
    await executor.execute({
      call: scheduledCall,
      signal: new AbortController().signal,
      onUpdateToolCall,
    });

    // 4. Verify PID was reported
    expect(onUpdateToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        status: CoreToolCallStatus.Executing,
        pid: testPid,
      }),
    );
  });
});
