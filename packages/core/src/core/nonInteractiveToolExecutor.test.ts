/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeToolCall } from './nonInteractiveToolExecutor.js';
import {
  ToolRegistry,
  ToolCallRequestInfo,
  ToolResult,
  Tool,
  ToolCallConfirmationDetails,
  Config,
} from '../index.js';
import { Part, Type } from '@google/genai';

const mockConfig = {
  getSessionId: () => 'test-session-id',
  getUsageStatisticsEnabled: () => true,
  getDebugMode: () => false,
} as unknown as Config;

describe('executeToolCall', () => {
  let mockToolRegistry: ToolRegistry;
  let mockTool: Tool;
  let abortController: AbortController;

  beforeEach(() => {
    mockTool = {
      name: 'testTool',
      displayName: 'Test Tool',
      description: 'A tool for testing',
      schema: {
        name: 'testTool',
        description: 'A tool for testing',
        parameters: {
          type: Type.OBJECT,
          properties: {
            param1: { type: Type.STRING },
          },
          required: ['param1'],
        },
      },
      execute: vi.fn(),
      validateToolParams: vi.fn(() => null),
      shouldConfirmExecute: vi.fn(() =>
        Promise.resolve(false as false | ToolCallConfirmationDetails),
      ),
      isOutputMarkdown: false,
      canUpdateOutput: false,
      getDescription: vi.fn(),
    };

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
    vi.mocked(mockTool.execute).mockResolvedValue(toolResult);

    const response = await executeToolCall(
      mockConfig,
      request,
      mockToolRegistry,
      abortController.signal,
    );

    expect(mockToolRegistry.getTool).toHaveBeenCalledWith('testTool');
    expect(mockTool.execute).toHaveBeenCalledWith(
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
      name: 'nonExistentTool',
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
      'Tool "nonExistentTool" not found in registry.',
    );
    expect(response.resultDisplay).toBe(
      'Tool "nonExistentTool" not found in registry.',
    );
    expect(response.responseParts).toEqual([
      {
        functionResponse: {
          name: 'nonExistentTool',
          id: 'call2',
          response: { error: 'Tool "nonExistentTool" not found in registry.' },
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
    vi.mocked(mockTool.execute).mockRejectedValue(executionError);

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

    vi.mocked(mockTool.execute).mockImplementation(async (_args, signal) => {
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
    });

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
    vi.mocked(mockTool.execute).mockResolvedValue(toolResult);

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
