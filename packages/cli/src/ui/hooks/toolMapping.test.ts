/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapToDisplay } from './toolMapping.js';
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
  });
});
