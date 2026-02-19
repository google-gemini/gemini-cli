/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fsPromises from 'node:fs/promises';
import { ToolExecutor } from './tool-executor.js';
import type { Config, AnyToolInvocation } from '../index.js';
import type { ToolResult } from '../tools/tools.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { MockTool } from '../test-utils/mock-tool.js';
import type { ScheduledToolCall } from './types.js';
import { CoreToolCallStatus } from './types.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import * as fileUtils from '../utils/fileUtils.js';
import * as coreToolHookTriggers from '../core/coreToolHookTriggers.js';
import { ShellToolInvocation } from '../tools/shell.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

// Mock file utils
vi.mock('../utils/fileUtils.js', () => ({
  saveTruncatedToolOutput: vi.fn(),
  formatTruncatedToolOutput: vi.fn(),
  moveToolOutputToFile: vi.fn(),
}));

// Mock executeToolWithHooks
vi.mock('../core/coreToolHookTriggers.js', () => ({
  executeToolWithHooks: vi.fn(),
}));

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
  });

  it('should handle execution errors', async () => {
    const mockTool = new MockTool({
      name: 'failTool',
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
      expect(response).toEqual({
        output: 'TruncatedContent...',
        outputFile: '/tmp/truncated_output.txt',
      });
      expect(result.response.outputFile).toBe('/tmp/truncated_output.txt');
    }
  });

  it('should truncate large output and move file when fullOutputFilePath is provided', async () => {
    // 1. Setup Config for Truncation
    vi.spyOn(config, 'getTruncateToolOutputThreshold').mockReturnValue(10);
    vi.spyOn(config.storage, 'getProjectTempDir').mockReturnValue('/tmp');
    vi.spyOn(fileUtils, 'moveToolOutputToFile').mockResolvedValue({
      outputFile: '/tmp/moved_output.txt',
    });

    const mockTool = new MockTool({ name: SHELL_TOOL_NAME });
    const invocation = mockTool.build({});
    const longOutput = 'This is a very long output that should be truncated.';

    // 2. Mock execution returning long content AND fullOutputFilePath
    vi.mocked(coreToolHookTriggers.executeToolWithHooks).mockResolvedValue({
      llmContent: longOutput,
      returnDisplay: longOutput,
      fullOutputFilePath: '/tmp/temp_full_output.txt',
    });

    const scheduledCall: ScheduledToolCall = {
      status: CoreToolCallStatus.Scheduled,
      request: {
        callId: 'call-trunc-full',
        name: SHELL_TOOL_NAME,
        args: { command: 'echo long' },
        isClientInitiated: false,
        prompt_id: 'prompt-trunc-full',
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
    expect(fileUtils.moveToolOutputToFile).toHaveBeenCalledWith(
      '/tmp/temp_full_output.txt',
      SHELL_TOOL_NAME,
      'call-trunc-full',
      expect.any(String), // temp dir
      'test-session-id', // session id from makeFakeConfig
    );

    expect(fileUtils.formatTruncatedToolOutput).toHaveBeenCalledWith(
      longOutput,
      '/tmp/moved_output.txt',
      10, // threshold (maxChars)
    );

    expect(result.status).toBe(CoreToolCallStatus.Success);
    if (result.status === CoreToolCallStatus.Success) {
      const response = result.response.responseParts[0]?.functionResponse
        ?.response as Record<string, unknown>;
      // The content should be the *truncated* version returned by the mock formatTruncatedToolOutput
      expect(response).toEqual({
        output: 'TruncatedContent...',
        outputFile: '/tmp/moved_output.txt',
      });
      expect(result.response.outputFile).toBe('/tmp/moved_output.txt');
    }
  });

  it('should delete temporary file when fullOutputFilePath is provided but output is not truncated', async () => {
    // 1. Setup Config for Truncation
    vi.spyOn(config, 'getTruncateToolOutputThreshold').mockReturnValue(100);
    const unlinkSpy = vi
      .spyOn(fsPromises, 'unlink')
      .mockResolvedValue(undefined);

    const mockTool = new MockTool({ name: SHELL_TOOL_NAME });
    const invocation = mockTool.build({});
    const shortOutput = 'Short';

    // 2. Mock execution returning short content AND fullOutputFilePath
    vi.mocked(coreToolHookTriggers.executeToolWithHooks).mockResolvedValue({
      llmContent: shortOutput,
      returnDisplay: shortOutput,
      fullOutputFilePath: '/tmp/temp_full_output_short.txt',
    });

    const scheduledCall: ScheduledToolCall = {
      status: CoreToolCallStatus.Scheduled,
      request: {
        callId: 'call-short-full',
        name: SHELL_TOOL_NAME,
        args: { command: 'echo short' },
        isClientInitiated: false,
        prompt_id: 'prompt-short-full',
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

    // 4. Verify file deletion
    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/temp_full_output_short.txt');
    expect(fileUtils.formatTruncatedToolOutput).not.toHaveBeenCalled();

    // We should not save it since it was not truncated
    expect(result.status).toBe(CoreToolCallStatus.Success);
    if (result.status === CoreToolCallStatus.Success) {
      const response = result.response.responseParts[0]?.functionResponse
        ?.response as Record<string, unknown>;
      expect(response).toEqual({
        output: 'Short',
      });
      expect(result.response.outputFile).toBeUndefined();
    }

    unlinkSpy.mockRestore();
  });

  it('should delete temporary file on error if fullOutputFilePath is provided', async () => {
    const unlinkSpy = vi
      .spyOn(fsPromises, 'unlink')
      .mockResolvedValue(undefined);
    const mockTool = new MockTool({ name: 'failTool' });
    const invocation = mockTool.build({});

    vi.mocked(coreToolHookTriggers.executeToolWithHooks).mockResolvedValue({
      llmContent: 'partial',
      returnDisplay: 'partial',
      fullOutputFilePath: '/tmp/temp_error.txt',
      error: { message: 'Tool Failed' },
    });

    const scheduledCall: ScheduledToolCall = {
      status: CoreToolCallStatus.Scheduled,
      request: {
        callId: 'call-err',
        name: 'failTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-err',
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

    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/temp_error.txt');
    expect(result.status).toBe(CoreToolCallStatus.Error);
    unlinkSpy.mockRestore();
  });

  it('should delete temporary file on abort if fullOutputFilePath is provided', async () => {
    const unlinkSpy = vi
      .spyOn(fsPromises, 'unlink')
      .mockResolvedValue(undefined);
    const mockTool = new MockTool({ name: 'slowTool' });
    const invocation = mockTool.build({});

    const controller = new AbortController();

    vi.mocked(coreToolHookTriggers.executeToolWithHooks).mockImplementation(
      async () => {
        controller.abort();
        return {
          llmContent: 'partial',
          returnDisplay: 'partial',
          fullOutputFilePath: '/tmp/temp_abort.txt',
        };
      },
    );

    const scheduledCall: ScheduledToolCall = {
      status: CoreToolCallStatus.Scheduled,
      request: {
        callId: 'call-abort',
        name: 'slowTool',
        args: {},
        isClientInitiated: false,
        prompt_id: 'prompt-abort',
      },
      tool: mockTool,
      invocation: invocation as unknown as AnyToolInvocation,
      startTime: Date.now(),
    };

    const result = await executor.execute({
      call: scheduledCall,
      signal: controller.signal,
      onUpdateToolCall: vi.fn(),
    });

    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/temp_abort.txt');
    expect(result.status).toBe(CoreToolCallStatus.Cancelled);
    unlinkSpy.mockRestore();
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
