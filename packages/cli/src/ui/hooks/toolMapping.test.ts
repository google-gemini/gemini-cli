/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapToDisplay,
  hasDensePayload,
  getToolFileDiff,
  hasPayloadResult,
} from './toolMapping.js';
import {
  type AnyDeclarativeTool,
  type AnyToolInvocation,
  type ToolCallRequestInfo,
  type ToolCallResponseInfo,
  type Status,
  type ToolCall,
  type ScheduledToolCall,
  type SuccessfulToolCall,
  type ExecutingToolCall,
  type WaitingToolCall,
  type CancelledToolCall,
  CoreToolCallStatus,
} from '@google/gemini-cli-core';
import { ToolCallStatus, mapCoreStatusToDisplayStatus } from '../types.js';

describe('toolMapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mapCoreStatusToDisplayStatus', () => {
    it.each([
      [CoreToolCallStatus.Validating, ToolCallStatus.Pending],
      [CoreToolCallStatus.AwaitingApproval, ToolCallStatus.Confirming],
      [CoreToolCallStatus.Executing, ToolCallStatus.Executing],
      [CoreToolCallStatus.Success, ToolCallStatus.Success],
      [CoreToolCallStatus.Cancelled, ToolCallStatus.Canceled],
      [CoreToolCallStatus.Error, ToolCallStatus.Error],
      [CoreToolCallStatus.Scheduled, ToolCallStatus.Pending],
    ] as const)('maps %s to %s', (coreStatus, expectedDisplayStatus) => {
      expect(mapCoreStatusToDisplayStatus(coreStatus)).toBe(
        expectedDisplayStatus,
      );
    });

    it('throws error for unknown status due to checkExhaustive', () => {
      expect(() =>
        mapCoreStatusToDisplayStatus('unknown_status' as Status),
      ).toThrow('unexpected value unknown_status!');
    });
  });

  describe('mapToDisplay', () => {
    const mockRequest: ToolCallRequestInfo = {
      callId: 'call-1',
      name: 'test_tool',
      args: { arg1: 'val1' },
      isClientInitiated: false,
      prompt_id: 'p1',
    };

    const mockTool = {
      name: 'test_tool',
      displayName: 'Test Tool',
      isOutputMarkdown: true,
    } as unknown as AnyDeclarativeTool;

    const mockInvocation = {
      getDescription: () => 'Calling test_tool with args...',
    } as unknown as AnyToolInvocation;

    const mockResponse: ToolCallResponseInfo = {
      callId: 'call-1',
      responseParts: [],
      resultDisplay: 'Success output',
      error: undefined,
      errorType: undefined,
    };

    it('handles a single tool call input', () => {
      const toolCall: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
      };

      const result = mapToDisplay(toolCall);
      expect(result.type).toBe('tool_group');
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0]?.callId).toBe('call-1');
    });

    it('handles an array of tool calls', () => {
      const toolCall1: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
      };
      const toolCall2: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: { ...mockRequest, callId: 'call-2' },
        tool: mockTool,
        invocation: mockInvocation,
      };

      const result = mapToDisplay([toolCall1, toolCall2]);
      expect(result.tools).toHaveLength(2);
      expect(result.tools[0]?.callId).toBe('call-1');
      expect(result.tools[1]?.callId).toBe('call-2');
    });

    it('maps successful tool call properties correctly', () => {
      const toolCall: SuccessfulToolCall = {
        status: CoreToolCallStatus.Success,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
        response: {
          ...mockResponse,
          outputFile: '/tmp/output.txt',
        },
      };

      const result = mapToDisplay(toolCall);
      const displayTool = result.tools[0];

      expect(displayTool).toEqual(
        expect.objectContaining({
          callId: 'call-1',
          name: 'Test Tool',
          description: 'Calling test_tool with args...',
          renderOutputAsMarkdown: true,
          status: CoreToolCallStatus.Success,
          resultDisplay: 'Success output',
          outputFile: '/tmp/output.txt',
        }),
      );
    });

    it('maps executing tool call properties correctly with live output and ptyId', () => {
      const toolCall: ExecutingToolCall = {
        status: CoreToolCallStatus.Executing,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
        liveOutput: 'Loading...',
        pid: 12345,
      };

      const result = mapToDisplay(toolCall);
      const displayTool = result.tools[0];

      expect(displayTool.status).toBe(CoreToolCallStatus.Executing);
      expect(displayTool.resultDisplay).toBe('Loading...');
      expect(displayTool.ptyId).toBe(12345);
    });

    it('maps awaiting_approval tool call properties with correlationId', () => {
      const confirmationDetails = {
        type: 'exec' as const,
        title: 'Confirm Exec',
        command: 'ls',
        rootCommand: 'ls',
        rootCommands: ['ls'],
        onConfirm: vi.fn(),
      };

      const toolCall: WaitingToolCall = {
        status: CoreToolCallStatus.AwaitingApproval,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
        confirmationDetails,
        correlationId: 'corr-id-123',
      };

      const result = mapToDisplay(toolCall);
      const displayTool = result.tools[0];

      expect(displayTool.status).toBe(CoreToolCallStatus.AwaitingApproval);
      expect(displayTool.confirmationDetails).toEqual(confirmationDetails);
    });

    it('maps correlationId and serializable confirmation details', () => {
      const serializableDetails = {
        type: 'edit' as const,
        title: 'Confirm Edit',
        fileName: 'file.txt',
        filePath: '/path/file.txt',
        fileDiff: 'diff',
        originalContent: 'old',
        newContent: 'new',
      };

      const toolCall: WaitingToolCall = {
        status: CoreToolCallStatus.AwaitingApproval,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
        confirmationDetails: serializableDetails,
        correlationId: 'corr-123',
      };

      const result = mapToDisplay(toolCall);
      const displayTool = result.tools[0];

      expect(displayTool.correlationId).toBe('corr-123');
      expect(displayTool.confirmationDetails).toEqual(serializableDetails);
    });

    it('maps error tool call missing tool definition', () => {
      // e.g. "TOOL_NOT_REGISTERED" errors
      const toolCall: ToolCall = {
        status: CoreToolCallStatus.Error,
        request: mockRequest, // name: 'test_tool'
        response: { ...mockResponse, resultDisplay: 'Tool not found' },
        // notice: no `tool` or `invocation` defined here
      };

      const result = mapToDisplay(toolCall);
      const displayTool = result.tools[0];

      expect(displayTool.status).toBe(CoreToolCallStatus.Error);
      expect(displayTool.name).toBe('test_tool'); // falls back to request.name
      expect(displayTool.description).toBe('{"arg1":"val1"}'); // falls back to stringified args
      expect(displayTool.resultDisplay).toBe('Tool not found');
      expect(displayTool.renderOutputAsMarkdown).toBe(false);
    });

    it('maps cancelled tool call properties correctly', () => {
      const toolCall: CancelledToolCall = {
        status: CoreToolCallStatus.Cancelled,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
        response: {
          ...mockResponse,
          resultDisplay: 'User cancelled', // Could be diff output for edits
        },
      };

      const result = mapToDisplay(toolCall);
      const displayTool = result.tools[0];

      expect(displayTool.status).toBe(CoreToolCallStatus.Cancelled);
      expect(displayTool.resultDisplay).toBe('User cancelled');
    });

    it('propagates borderTop and borderBottom options correctly', () => {
      const toolCall: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
      };

      const result = mapToDisplay(toolCall, {
        borderTop: true,
        borderBottom: false,
      });
      expect(result.borderTop).toBe(true);
      expect(result.borderBottom).toBe(false);
    });

    it('maps raw progress and progressTotal from Executing calls', () => {
      const toolCall: ExecutingToolCall = {
        status: CoreToolCallStatus.Executing,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
        progressMessage: 'Downloading...',
        progress: 5,
        progressTotal: 10,
      };

      const result = mapToDisplay(toolCall);
      const displayTool = result.tools[0];

      expect(displayTool.progress).toBe(5);
      expect(displayTool.progressTotal).toBe(10);
      expect(displayTool.progressMessage).toBe('Downloading...');
    });

    it('leaves progress fields undefined for non-Executing calls', () => {
      const toolCall: SuccessfulToolCall = {
        status: CoreToolCallStatus.Success,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
        response: mockResponse,
      };

      const result = mapToDisplay(toolCall);
      const displayTool = result.tools[0];

      expect(displayTool.progress).toBeUndefined();
      expect(displayTool.progressTotal).toBeUndefined();
    });

    it('sets resultDisplay to undefined for pre-execution statuses', () => {
      const toolCall: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
      };

      const result = mapToDisplay(toolCall);
      expect(result.tools[0].resultDisplay).toBeUndefined();
      expect(result.tools[0].status).toBe(CoreToolCallStatus.Scheduled);
    });

    it('propagates originalRequestName correctly', () => {
      const toolCall: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: {
          ...mockRequest,
          originalRequestName: 'original_tool',
        },
        tool: mockTool,
        invocation: mockInvocation,
      };

      const result = mapToDisplay(toolCall);
      expect(result.tools[0].originalRequestName).toBe('original_tool');
    });
    it('propagates isClientInitiated from tool request', () => {
      const clientInitiatedTool: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: {
          ...mockRequest,
          callId: 'call-client',
          isClientInitiated: true,
        },
        tool: mockTool,
        invocation: mockInvocation,
      };

      const modelInitiatedTool: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: {
          ...mockRequest,
          callId: 'call-model',
          isClientInitiated: false,
        },
        tool: mockTool,
        invocation: mockInvocation,
      };

      const result = mapToDisplay([clientInitiatedTool, modelInitiatedTool]);
      expect(result.tools[0].isClientInitiated).toBe(true);
      expect(result.tools[1].isClientInitiated).toBe(false);
    });

    it('populates hasDensePayload on mapped tool calls', () => {
      const scheduledTool: ScheduledToolCall = {
        status: CoreToolCallStatus.Scheduled,
        request: mockRequest,
        tool: mockTool,
        invocation: mockInvocation,
      };

      const outputFileTool: SuccessfulToolCall = {
        status: CoreToolCallStatus.Success,
        request: { ...mockRequest, callId: 'call-output-file' },
        tool: mockTool,
        invocation: mockInvocation,
        response: {
          ...mockResponse,
          outputFile: '/tmp/out.log',
        },
      };

      const fileDiffTool: SuccessfulToolCall = {
        status: CoreToolCallStatus.Success,
        request: { ...mockRequest, callId: 'call-diff' },
        tool: mockTool,
        invocation: mockInvocation,
        response: {
          ...mockResponse,
          resultDisplay: {
            fileName: 'test.ts',
            filePath: '/path/test.ts',
            fileDiff: '@@ -1 +1 @@\n-old\n+new',
            originalContent: 'old',
            newContent: 'new',
          },
        },
      };

      const payloadResultTool: SuccessfulToolCall = {
        status: CoreToolCallStatus.Success,
        request: { ...mockRequest, callId: 'call-payload' },
        tool: mockTool,
        invocation: mockInvocation,
        response: {
          ...mockResponse,
          resultDisplay: {
            summary: 'Read 10 lines',
            payload: 'line 1\nline 2',
          } as unknown as string,
        },
      };

      const editConfirmTool: WaitingToolCall = {
        status: CoreToolCallStatus.AwaitingApproval,
        request: { ...mockRequest, callId: 'call-edit-confirm' },
        tool: mockTool,
        invocation: mockInvocation,
        confirmationDetails: {
          type: 'edit',
          title: 'Confirm Edit',
          fileName: 'file.txt',
          filePath: '/path/file.txt',
          fileDiff: 'diff',
          originalContent: 'old',
          newContent: 'new',
        },
      };

      const result = mapToDisplay([
        scheduledTool,
        outputFileTool,
        fileDiffTool,
        payloadResultTool,
        editConfirmTool,
      ]);

      expect(result.tools[0].hasDensePayload).toBe(false);
      expect(result.tools[1].hasDensePayload).toBe(true);
      expect(result.tools[2].hasDensePayload).toBe(true);
      expect(result.tools[3].hasDensePayload).toBe(true);
      expect(result.tools[4].hasDensePayload).toBe(true);
    });
  });

  describe('hasPayloadResult, getToolFileDiff, and hasDensePayload', () => {
    it('identifies valid PayloadResult objects via hasPayloadResult', () => {
      expect(hasPayloadResult({ summary: 'sum', payload: 'data' })).toBe(true);
      expect(hasPayloadResult({ summary: 'sum', files: ['a.txt'] })).toBe(
        false,
      );
      expect(hasPayloadResult({ summary: 'sum', payload: 123 })).toBe(false);
      expect(hasPayloadResult('plain string')).toBe(false);
      expect(hasPayloadResult(undefined)).toBe(false);
    });

    it('extracts FileDiff from resultDisplay or edit confirmationDetails via getToolFileDiff', () => {
      const diffResult = {
        fileName: 'a.ts',
        filePath: '/a.ts',
        fileDiff: '+a',
        originalContent: '',
        newContent: 'a',
      };
      expect(
        getToolFileDiff({
          resultDisplay: diffResult,
          confirmationDetails: undefined,
        }),
      ).toEqual(diffResult);

      expect(
        getToolFileDiff({
          resultDisplay: undefined,
          confirmationDetails: {
            type: 'edit',
            title: 'Edit a.ts',
            fileName: 'a.ts',
            filePath: '/a.ts',
            fileDiff: '+a',
            originalContent: '',
            newContent: 'a',
          },
        }),
      ).toEqual({
        fileName: 'a.ts',
        filePath: '/a.ts',
        fileDiff: '+a',
        originalContent: '',
        newContent: 'a',
        diffStat: undefined,
      });

      expect(
        getToolFileDiff({
          resultDisplay: 'plain output',
          confirmationDetails: undefined,
        }),
      ).toBeUndefined();
    });

    it('computes hasDensePayload accurately across tool call display variants', () => {
      expect(
        hasDensePayload({
          outputFile: '/tmp/out.txt',
          resultDisplay: undefined,
          confirmationDetails: undefined,
        }),
      ).toBe(true);

      expect(
        hasDensePayload({
          outputFile: undefined,
          resultDisplay: undefined,
          confirmationDetails: {
            type: 'edit',
            title: 'Confirm Edit',
            fileName: 'a.ts',
            filePath: '/a.ts',
            fileDiff: '+a',
            originalContent: '',
            newContent: 'a',
          },
        }),
      ).toBe(true);

      expect(
        hasDensePayload({
          outputFile: undefined,
          resultDisplay: { summary: 'Listed 2 files', files: ['a', 'b'] },
          confirmationDetails: undefined,
        }),
      ).toBe(false);

      expect(
        hasDensePayload({
          outputFile: undefined,
          resultDisplay: 'simple string output',
          confirmationDetails: undefined,
        }),
      ).toBe(false);
    });
  });
});
