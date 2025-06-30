/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import {
  CoreToolScheduler,
  ToolCall,
  ValidatingToolCall,
  convertToFunctionResponse,
} from './coreToolScheduler.js';
import {
  BaseTool,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolResult,
  Config,
} from '../index.js';
import { Part, PartListUnion } from '@google/genai';

class MockTool extends BaseTool<Record<string, unknown>, ToolResult> {
  shouldConfirm = false;
  executeFn = vi.fn();

  constructor(name = 'mockTool') {
    super(name, name, 'A mock tool', {});
  }

  async shouldConfirmExecute(
    _params: Record<string, unknown>,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldConfirm) {
      return {
        type: 'exec',
        title: 'Confirm Mock Tool',
        command: 'do_thing',
        rootCommand: 'do_thing',
        onConfirm: async () => {},
      };
    }
    return false;
  }

  async execute(
    params: Record<string, unknown>,
    _abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    this.executeFn(params);
    return { llmContent: 'Tool executed', returnDisplay: 'Tool executed' };
  }
}

describe('CoreToolScheduler', () => {
  it('should cancel a tool call if the signal is aborted before confirmation', async () => {
    const mockTool = new MockTool();
    mockTool.shouldConfirm = true;
    const toolRegistry = {
      getTool: () => mockTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {} as any,
      registerTool: () => {},
      getToolByName: () => mockTool,
      getToolByDisplayName: () => mockTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    };

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = {
      getGeminiClient: () =>
        ({
          generateContent: vi.fn(),
        }) as unknown as GeminiClient,
      getToolRegistry: () => toolRegistry,
      getUsageStatisticsEnabled: () => false,
    };

    const scheduler = new CoreToolScheduler({
      config: mockConfig as any,
      toolRegistry: Promise.resolve(toolRegistry as any),
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
    };

    abortController.abort();
    await scheduler.schedule([request], abortController.signal);

    const _waitingCall = onToolCallsUpdate.mock
      .calls[1][0][0] as ValidatingToolCall;
    const confirmationDetails = await mockTool.shouldConfirmExecute(
      {},
      abortController.signal,
    );
    if (confirmationDetails) {
      await scheduler.handleConfirmationResponse(
        '1',
        confirmationDetails.onConfirm,
        ToolConfirmationOutcome.ProceedOnce,
        abortController.signal,
      );
    }

    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('cancelled');
  });
});

import { GeminiClient } from '../index.js';

describe('convertToFunctionResponse', () => {
  const toolName = 'testTool';
  const callId = 'call1';
  const mockGeminiClient = {
    generateContent: vi.fn(),
  } as unknown as GeminiClient;
  const mockConfig = {
    getGeminiClient: () =>
      ({
        generateContent: vi.fn(),
      }) as unknown as GeminiClient,
    getToolRegistry: async () => ({
      getTool: () => undefined,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {} as any,
      registerTool: () => {},
      getToolByName: () => undefined,
      getToolByDisplayName: () => undefined,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    }),
  } as unknown as Config;
  const abortController = new AbortController();
  const signal = abortController.signal;

  it('should handle simple string llmContent', async () => {
    const llmContent = 'Simple text output';
    (mockGeminiClient.generateContent as any).mockResolvedValue({
      text: () => llmContent,
    });
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Simple text output' },
      },
    });
  });

  it('should handle llmContent as a single Part with text', async () => {
    const llmContent: Part = { text: 'Text from Part object' };
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Text from Part object' },
      },
    });
  });

  it('should handle llmContent as a PartListUnion array with a single text Part', async () => {
    const llmContent: PartListUnion = [{ text: 'Text from array' }];
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Text from array' },
      },
    });
  });

  it('should handle llmContent with inlineData', async () => {
    const llmContent: Part = {
      inlineData: { mimeType: 'image/png', data: 'base64...' },
    };
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: {
            output: 'Binary content of type image/png was processed.',
          },
        },
      },
      llmContent,
    ]);
  });

  it('should handle llmContent with fileData', async () => {
    const llmContent: Part = {
      fileData: { mimeType: 'application/pdf', fileUri: 'gs://...' },
    };
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: {
            output: 'Binary content of type application/pdf was processed.',
          },
        },
      },
      llmContent,
    ]);
  });

  it('should handle llmContent as an array of multiple Parts (text and inlineData)', async () => {
    const llmContent: PartListUnion = [
      { text: 'Some textual description' },
      { inlineData: { mimeType: 'image/jpeg', data: 'base64data...' } },
      { text: 'Another text part' },
    ];
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: { output: 'Tool execution succeeded.' },
        },
      },
      ...llmContent,
    ]);
  });

  it('should handle llmContent as an array with a single inlineData Part', async () => {
    const llmContent: PartListUnion = [
      { inlineData: { mimeType: 'image/gif', data: 'gifdata...' } },
    ];
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: {
            output: 'Binary content of type image/gif was processed.',
          },
        },
      },
      ...llmContent,
    ]);
  });

  it('should handle llmContent as a generic Part (not text, inlineData, or fileData)', async () => {
    const llmContent: Part = { functionCall: { name: 'test', args: {} } };
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Tool execution succeeded.' },
      },
    });
  });

  it('should handle empty string llmContent', async () => {
    const llmContent = '';
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: '' },
      },
    });
  });

  it('should handle llmContent as an empty array', async () => {
    const llmContent: PartListUnion = [];
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual([
      {
        functionResponse: {
          name: toolName,
          id: callId,
          response: { output: 'Tool execution succeeded.' },
        },
      },
    ]);
  });

  it('should handle llmContent as a Part with undefined inlineData/fileData/text', async () => {
    const llmContent: Part = {}; // An empty part object
    const result = await convertToFunctionResponse(
      toolName,
      callId,
      llmContent,
      mockConfig,
      signal,
    );
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Tool execution succeeded.' },
      },
    });
  });
});
