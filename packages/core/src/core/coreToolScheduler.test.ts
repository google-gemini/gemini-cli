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
  ToolConfirmationPayload,
  ToolResult,
  Config,
  Icon,
  ApprovalMode,
} from '../index.js';
import { Part, PartListUnion } from '@google/genai';

import { ModifiableTool, ModifyContext } from '../tools/modifiable-tool.js';

class MockTool extends BaseTool<Record<string, unknown>, ToolResult> {
  shouldConfirm = false;
  executeFn = vi.fn();

  constructor(name = 'mockTool') {
    super(name, name, 'A mock tool', Icon.Hammer, {});
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

class MockModifiableTool
  extends MockTool
  implements ModifiableTool<Record<string, unknown>>
{
  constructor(name = 'mockModifiableTool') {
    super(name);
    this.shouldConfirm = true;
  }

  getModifyContext(
    _abortSignal: AbortSignal,
  ): ModifyContext<Record<string, unknown>> {
    return {
      getFilePath: () => 'test.txt',
      getCurrentContent: async () => 'old content',
      getProposedContent: async () => 'new content',
      createUpdatedParams: (
        _oldContent: string,
        modifiedProposedContent: string,
        _originalParams: Record<string, unknown>,
      ) => ({ newContent: modifiedProposedContent }),
    };
  }

  async shouldConfirmExecute(
    _params: Record<string, unknown>,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.shouldConfirm) {
      return {
        type: 'edit',
        title: 'Confirm Mock Tool',
        fileName: 'test.txt',
        fileDiff: 'diff',
        originalContent: 'originalContent',
        newContent: 'newContent',
        onConfirm: async () => {},
      };
    }
    return false;
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
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getApprovalMode: () => ApprovalMode.DEFAULT,
    } as unknown as Config;

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      toolRegistry: Promise.resolve(toolRegistry as any),
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
      onEditorClose: vi.fn(),
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-1',
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

describe('CoreToolScheduler with payload', () => {
  it('should update args and diff and execute tool when payload is provided', async () => {
    const mockTool = new MockModifiableTool();
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
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getApprovalMode: () => ApprovalMode.DEFAULT,
    } as unknown as Config;

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      toolRegistry: Promise.resolve(toolRegistry as any),
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
      onEditorClose: vi.fn(),
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockModifiableTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-2',
    };

    await scheduler.schedule([request], abortController.signal);

    const confirmationDetails = await mockTool.shouldConfirmExecute(
      {},
      abortController.signal,
    );

    if (confirmationDetails) {
      const payload: ToolConfirmationPayload = { newContent: 'final version' };
      await scheduler.handleConfirmationResponse(
        '1',
        confirmationDetails.onConfirm,
        ToolConfirmationOutcome.ProceedOnce,
        abortController.signal,
        payload,
      );
    }

    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls[0].status).toBe('success');
    expect(mockTool.executeFn).toHaveBeenCalledWith({
      newContent: 'final version',
    });
  });
});

describe('convertToFunctionResponse', () => {
  const toolName = 'testTool';
  const callId = 'call1';

  it('should handle simple string llmContent', () => {
    const llmContent = 'Simple text output';
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Simple text output' },
      },
    });
  });

  it('should handle llmContent as a single Part with text', () => {
    const llmContent: Part = { text: 'Text from Part object' };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Text from Part object' },
      },
    });
  });

  it('should handle llmContent as a PartListUnion array with a single text Part', () => {
    const llmContent: PartListUnion = [{ text: 'Text from array' }];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Text from array' },
      },
    });
  });

  it('should handle llmContent with inlineData', () => {
    const llmContent: Part = {
      inlineData: { mimeType: 'image/png', data: 'base64...' },
    };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
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

  it('should handle llmContent with fileData', () => {
    const llmContent: Part = {
      fileData: { mimeType: 'application/pdf', fileUri: 'gs://...' },
    };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
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

  it('should handle llmContent as an array of multiple Parts (text and inlineData)', () => {
    const llmContent: PartListUnion = [
      { text: 'Some textual description' },
      { inlineData: { mimeType: 'image/jpeg', data: 'base64data...' } },
      { text: 'Another text part' },
    ];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
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

  it('should handle llmContent as an array with a single inlineData Part', () => {
    const llmContent: PartListUnion = [
      { inlineData: { mimeType: 'image/gif', data: 'gifdata...' } },
    ];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
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

  it('should handle llmContent as a generic Part (not text, inlineData, or fileData)', () => {
    const llmContent: Part = { functionCall: { name: 'test', args: {} } };
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Tool execution succeeded.' },
      },
    });
  });

  it('should handle empty string llmContent', () => {
    const llmContent = '';
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: '' },
      },
    });
  });

  it('should handle llmContent as an empty array', () => {
    const llmContent: PartListUnion = [];
    const result = convertToFunctionResponse(toolName, callId, llmContent);
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

  it('should handle llmContent as a Part with undefined inlineData/fileData/text', () => {
    const llmContent: Part = {}; // An empty part object
    const result = convertToFunctionResponse(toolName, callId, llmContent);
    expect(result).toEqual({
      functionResponse: {
        name: toolName,
        id: callId,
        response: { output: 'Tool execution succeeded.' },
      },
    });
  });
});

describe('CoreToolScheduler edit cancellation', () => {
  it('should preserve diff when an edit is cancelled', async () => {
    class MockEditTool extends BaseTool<Record<string, unknown>, ToolResult> {
      constructor() {
        super(
          'mockEditTool',
          'mockEditTool',
          'A mock edit tool',
          Icon.Pencil,
          {},
        );
      }

      async shouldConfirmExecute(
        _params: Record<string, unknown>,
        _abortSignal: AbortSignal,
      ): Promise<ToolCallConfirmationDetails | false> {
        return {
          type: 'edit',
          title: 'Confirm Edit',
          fileName: 'test.txt',
          fileDiff:
            '--- test.txt\n+++ test.txt\n@@ -1,1 +1,1 @@\n-old content\n+new content',
          originalContent: 'old content',
          newContent: 'new content',
          onConfirm: async () => {},
        };
      }

      async execute(
        _params: Record<string, unknown>,
        _abortSignal: AbortSignal,
      ): Promise<ToolResult> {
        return {
          llmContent: 'Edited successfully',
          returnDisplay: 'Edited successfully',
        };
      }
    }

    const mockEditTool = new MockEditTool();
    const toolRegistry = {
      getTool: () => mockEditTool,
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {} as any,
      registerTool: () => {},
      getToolByName: () => mockEditTool,
      getToolByDisplayName: () => mockEditTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    };

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getApprovalMode: () => ApprovalMode.DEFAULT,
    } as unknown as Config;

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      toolRegistry: Promise.resolve(toolRegistry as any),
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
      onEditorClose: vi.fn(),
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockEditTool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'prompt-id-1',
    };

    await scheduler.schedule([request], abortController.signal);

    // Wait for the tool to reach awaiting_approval state
    const awaitingCall = onToolCallsUpdate.mock.calls.find(
      (call) => call[0][0].status === 'awaiting_approval',
    )?.[0][0];

    expect(awaitingCall).toBeDefined();

    // Cancel the edit
    const confirmationDetails = await mockEditTool.shouldConfirmExecute(
      {},
      abortController.signal,
    );
    if (confirmationDetails) {
      await scheduler.handleConfirmationResponse(
        '1',
        confirmationDetails.onConfirm,
        ToolConfirmationOutcome.Cancel,
        abortController.signal,
      );
    }

    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];

    expect(completedCalls[0].status).toBe('cancelled');

    // Check that the diff is preserved
    const cancelledCall = completedCalls[0] as any;
    expect(cancelledCall.response.resultDisplay).toBeDefined();
    expect(cancelledCall.response.resultDisplay.fileDiff).toBe(
      '--- test.txt\n+++ test.txt\n@@ -1,1 +1,1 @@\n-old content\n+new content',
    );
    expect(cancelledCall.response.resultDisplay.fileName).toBe('test.txt');
  });
});

describe('CoreToolScheduler YOLO mode', () => {
  it('should execute tool requiring confirmation directly without waiting', async () => {
    // Arrange
    const mockTool = new MockTool();
    // This tool would normally require confirmation.
    mockTool.shouldConfirm = true;

    const toolRegistry = {
      getTool: () => mockTool,
      getToolByName: () => mockTool,
      // Other properties are not needed for this test but are included for type consistency.
      getFunctionDeclarations: () => [],
      tools: new Map(),
      discovery: {} as any,
      registerTool: () => {},
      getToolByDisplayName: () => mockTool,
      getTools: () => [],
      discoverTools: async () => {},
      getAllTools: () => [],
      getToolsByServer: () => [],
    };

    const onAllToolCallsComplete = vi.fn();
    const onToolCallsUpdate = vi.fn();

    // Configure the scheduler for YOLO mode.
    const mockConfig = {
      getSessionId: () => 'test-session-id',
      getUsageStatisticsEnabled: () => true,
      getDebugMode: () => false,
      getApprovalMode: () => ApprovalMode.YOLO,
    } as unknown as Config;

    const scheduler = new CoreToolScheduler({
      config: mockConfig,
      toolRegistry: Promise.resolve(toolRegistry as any),
      onAllToolCallsComplete,
      onToolCallsUpdate,
      getPreferredEditor: () => 'vscode',
      onEditorClose: vi.fn(),
    });

    const abortController = new AbortController();
    const request = {
      callId: '1',
      name: 'mockTool',
      args: { param: 'value' },
      isClientInitiated: false,
      prompt_id: 'prompt-id-yolo',
    };

    // Act
    await scheduler.schedule([request], abortController.signal);

    // Assert
    // 1. The tool's execute method was called directly.
    expect(mockTool.executeFn).toHaveBeenCalledWith({ param: 'value' });

    // 2. The tool call status never entered 'awaiting_approval'.
    const statusUpdates = onToolCallsUpdate.mock.calls
      .map((call) => (call[0][0] as ToolCall)?.status)
      .filter(Boolean);
    expect(statusUpdates).not.toContain('awaiting_approval');
    expect(statusUpdates).toEqual([
      'validating',
      'scheduled',
      'executing',
      'success',
    ]);

    // 3. The final callback indicates the tool call was successful.
    expect(onAllToolCallsComplete).toHaveBeenCalled();
    const completedCalls = onAllToolCallsComplete.mock
      .calls[0][0] as ToolCall[];
    expect(completedCalls).toHaveLength(1);
    const completedCall = completedCalls[0];
    expect(completedCall.status).toBe('success');
    if (completedCall.status === 'success') {
      expect(completedCall.response.resultDisplay).toBe('Tool executed');
    }
  });
});
