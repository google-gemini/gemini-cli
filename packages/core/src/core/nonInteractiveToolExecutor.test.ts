/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { executeToolCall } from './nonInteractiveToolExecutor.js';
import {
  ToolRegistry,
  ToolCallRequestInfo,
  ToolResult,
  Config,
  logToolCall,
} from '../index.js';
import { Part } from '@google/genai';
import { MockTool } from '../test-utils/tools.js';

vi.mock('../index.js', async () => {
  const actual = await vi.importActual('../index.js');
  return {
    ...actual,
    logToolCall: vi.fn(),
  };
});

const mockConfig = {
  getSessionId: () => 'test-session-id',
  getUsageStatisticsEnabled: () => true,
  getDebugMode: () => false,
} as unknown as Config;

describe('executeToolCall', () => {
  let mockToolRegistry: ToolRegistry;
  let mockTool: MockTool;
  let abortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTool = new MockTool();

    mockToolRegistry = {
      getTool: vi.fn(),
      // Add other ToolRegistry methods if needed, or use a more complete mock
    } as unknown as ToolRegistry;

    abortController = new AbortController();
  });

  it('should execute a tool successfully', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call1',
      name: 'testTool',
      args: { param1: 'value1' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-1',
    };
    const toolResult: ToolResult = {
      llmContent: 'Tool executed successfully',
      returnDisplay: 'Success!',
    };
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(mockTool);
    vi.spyOn(mockTool, 'buildAndExecute').mockResolvedValue(toolResult);

    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(mockToolRegistry.getTool).toHaveBeenCalledWith('testTool');
    expect(mockTool.buildAndExecute).toHaveBeenCalledWith(
      request.args,
      abortController.signal,
    );
    expect(response.callId).toBe('call1');
    expect(response.error).toBeUndefined();
    expect(response.resultDisplay).toBe('Success!');
    expect(response.responseParts).toEqual({
      functionResponse: {
        name: 'testTool',
        id: 'call1',
        response: { output: 'Tool executed successfully' },
      },
    });
  });

  it('should return an error if tool is not found', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call2',
      name: 'nonexistentTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-2',
    };
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(undefined);

    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(response.callId).toBe('call2');
    expect(response.error).toBeInstanceOf(Error);
    expect(response.error?.message).toBe(
      'Tool "nonexistentTool" not found in registry.',
    );
    expect(response.resultDisplay).toBe(
      'Tool "nonexistentTool" not found in registry.',
    );
    expect(response.responseParts).toEqual([
      {
        functionResponse: {
          name: 'nonexistentTool',
          id: 'call2',
          response: { error: 'Tool "nonexistentTool" not found in registry.' },
        },
      },
    ]);
  });

  it('should return an error if tool execution fails', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call3',
      name: 'testTool',
      args: { param1: 'value1' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-3',
    };
    const executionError = new Error('Tool execution failed');
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(mockTool);
    vi.spyOn(mockTool, 'buildAndExecute').mockRejectedValue(executionError);

    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(response.callId).toBe('call3');
    expect(response.error).toBe(executionError);
    expect(response.resultDisplay).toBe('Tool execution failed');
    expect(response.responseParts).toEqual([
      {
        functionResponse: {
          name: 'testTool',
          id: 'call3',
          response: { error: 'Tool execution failed' },
        },
      },
    ]);
  });

  it('should handle cancellation during tool execution', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call4',
      name: 'testTool',
      args: { param1: 'value1' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-4',
    };
    const cancellationError = new Error('Operation cancelled');
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(mockTool);

    vi.spyOn(mockTool, 'buildAndExecute').mockImplementation(
      async (_args, signal) => {
        if (signal?.aborted) {
          return Promise.reject(cancellationError);
        }
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(cancellationError);
          });
          // Simulate work that might happen if not aborted immediately
          const timeoutId = setTimeout(
            () =>
              reject(
                new Error('Should have been cancelled if not aborted prior'),
              ),
            100,
          );
          signal?.addEventListener('abort', () => clearTimeout(timeoutId));
        });
      },
    );

    abortController.abort(); // Abort before calling
    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(response.callId).toBe('call4');
    expect(response.error?.message).toBe(cancellationError.message);
    expect(response.resultDisplay).toBe('Operation cancelled');
  });

  it('should correctly format llmContent with inlineData', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call5',
      name: 'testTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-5',
    };
    const imageDataPart: Part = {
      inlineData: { mimeType: 'image/png', data: 'base64data' },
    };
    const toolResult: ToolResult = {
      llmContent: [imageDataPart],
      returnDisplay: 'Image processed',
    };
    vi.mocked(mockToolRegistry.getTool).mockReturnValue(mockTool);
    vi.spyOn(mockTool, 'buildAndExecute').mockResolvedValue(toolResult);

    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(response.resultDisplay).toBe('Image processed');
    expect(response.responseParts).toEqual([
      {
        functionResponse: {
          name: 'testTool',
          id: 'call5',
          response: {
            output: 'Binary content of type image/png was processed.',
          },
        },
      },
      imageDataPart,
    ]);
  });
});

describe('executeToolCall with programming_language logging', () => {
  let mockToolRegistry: ToolRegistry;
  let mockTool: MockTool;
  let abortController: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTool = new MockTool();
    mockToolRegistry = {
      getTool: vi.fn().mockReturnValue(mockTool),
    } as unknown as ToolRegistry;
    abortController = new AbortController();
  });

  it('should log programming_language for write_file', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call-write',
      name: 'write_file',
      args: { file_path: 'test.ts', content: '' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-write',
    };
    vi.spyOn(mockTool, 'buildAndExecute').mockResolvedValue({
      llmContent: '',
      returnDisplay: '',
    });

    await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(logToolCall).toHaveBeenCalled();
    const loggedEvent = (logToolCall as Mock).mock.calls[0][1];
    expect(loggedEvent).toHaveProperty('programming_language', 'TypeScript');
  });

  it('should log programming_language for read_file', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call-read',
      name: 'read_file',
      args: { absolute_path: 'test.py' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-read',
    };
    vi.spyOn(mockTool, 'buildAndExecute').mockResolvedValue({
      llmContent: '',
      returnDisplay: '',
    });

    await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(logToolCall).toHaveBeenCalled();
    const loggedEvent = (logToolCall as Mock).mock.calls[0][1];
    expect(loggedEvent).toHaveProperty('programming_language', 'Python');
  });

  it('should not log programming_language for other tools', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call-glob',
      name: 'glob',
      args: { pattern: '**/*' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-glob',
    };
    vi.spyOn(mockTool, 'buildAndExecute').mockResolvedValue({
      llmContent: '',
      returnDisplay: '',
    });

    await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(logToolCall).toHaveBeenCalled();
    const loggedEvent = (logToolCall as Mock).mock.calls[0][1];
    expect(loggedEvent).not.toHaveProperty('programming_language');
  });

  it('should log programming_language on execution failure', async () => {
    const request: ToolCallRequestInfo = {
      callId: 'call-fail',
      name: 'write_file',
      args: { file_path: 'test.java', content: '' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-fail',
    };
    vi.spyOn(mockTool, 'buildAndExecute').mockRejectedValue(
      new Error('Failed'),
    );

    await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(logToolCall).toHaveBeenCalled();
    const loggedEvent = (logToolCall as Mock).mock.calls[0][1];
    expect(loggedEvent).toHaveProperty('programming_language', 'Java');
  });
});
