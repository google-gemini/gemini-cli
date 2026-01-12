/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolModificationHandler } from './tool-modifier.js';
import type { WaitingToolCall, ToolCallRequestInfo } from './types.js';
import * as modifiableToolModule from '../tools/modifiable-tool.js';
import * as Diff from 'diff';
import { MockModifiableTool, MockTool } from '../test-utils/mock-tool.js';
import type {
  ToolResult,
  ToolInvocation,
  ToolConfirmationPayload,
} from '../tools/tools.js';
import type { ModifyContext } from '../tools/modifiable-tool.js';
import type { Mock } from 'vitest';

// Mock the modules that export functions we need to control
vi.mock('diff', () => ({
  createPatch: vi.fn(),
  diffLines: vi.fn(),
}));

vi.mock('../tools/modifiable-tool.js', () => ({
  isModifiableDeclarativeTool: vi.fn(),
  modifyWithEditor: vi.fn(),
}));

type MockModifyContext = {
  [K in keyof ModifyContext<Record<string, unknown>>]: Mock;
};

function createMockWaitingToolCall(
  overrides: Partial<WaitingToolCall> = {},
): WaitingToolCall {
  return {
    status: 'awaiting_approval',
    request: {
      callId: 'test-call-id',
      name: 'test-tool',
      args: {},
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    } as ToolCallRequestInfo,
    tool: new MockTool({ name: 'test-tool' }),
    invocation: {} as ToolInvocation<Record<string, unknown>, ToolResult>, // We generally don't check invocation details in these tests
    confirmationDetails: {
      type: 'edit',
      title: 'Test Confirmation',
      fileName: 'test.txt',
      filePath: '/path/to/test.txt',
      fileDiff: 'diff',
      originalContent: 'original',
      newContent: 'new',
      onConfirm: async () => {},
    },
    ...overrides,
  };
}

describe('ToolModificationHandler', () => {
  let handler: ToolModificationHandler;
  let mockModifiableTool: MockModifiableTool;
  let mockPlainTool: MockTool;
  let mockModifyContext: MockModifyContext;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ToolModificationHandler();
    mockModifiableTool = new MockModifiableTool();
    mockPlainTool = new MockTool({ name: 'plainTool' });

    mockModifyContext = {
      getCurrentContent: vi.fn(),
      getFilePath: vi.fn(),
      createUpdatedParams: vi.fn(),
      getProposedContent: vi.fn(),
    };

    vi.spyOn(mockModifiableTool, 'getModifyContext').mockReturnValue(
      mockModifyContext as unknown as ModifyContext<Record<string, unknown>>,
    );
  });

  describe('handleModifyWithEditor', () => {
    it('should return undefined if tool is not modifiable', async () => {
      vi.mocked(
        modifiableToolModule.isModifiableDeclarativeTool,
      ).mockReturnValue(false);

      const mockWaitingToolCall = createMockWaitingToolCall({
        tool: mockPlainTool,
        request: {
          callId: 'call-1',
          name: 'plainTool',
          args: { path: 'foo.txt' },
          isClientInitiated: false,
          prompt_id: 'p1',
        },
      });

      const result = await handler.handleModifyWithEditor(
        mockWaitingToolCall,
        'vscode',
        new AbortController().signal,
      );

      expect(result).toBeUndefined();
    });

    it('should call modifyWithEditor and return updated params', async () => {
      vi.mocked(
        modifiableToolModule.isModifiableDeclarativeTool,
      ).mockReturnValue(true);

      vi.mocked(modifiableToolModule.modifyWithEditor).mockResolvedValue({
        updatedParams: { path: 'foo.txt', content: 'new' },
        updatedDiff: 'diff',
      });

      const mockWaitingToolCall = createMockWaitingToolCall({
        tool: mockModifiableTool,
        request: {
          callId: 'call-1',
          name: 'mockModifiableTool',
          args: { path: 'foo.txt' },
          isClientInitiated: false,
          prompt_id: 'p1',
        },
        confirmationDetails: {
          type: 'edit',
          title: 'Confirm',
          fileName: 'foo.txt',
          filePath: 'foo.txt',
          fileDiff: 'diff',
          originalContent: 'old',
          newContent: 'new',
          onConfirm: async () => {},
        },
      });

      const result = await handler.handleModifyWithEditor(
        mockWaitingToolCall,
        'vscode',
        new AbortController().signal,
      );

      expect(modifiableToolModule.modifyWithEditor).toHaveBeenCalledWith(
        mockWaitingToolCall.request.args,
        mockModifyContext,
        'vscode',
        expect.any(AbortSignal),
        { currentContent: 'old', proposedContent: 'new' },
      );

      expect(result).toEqual({
        updatedParams: { path: 'foo.txt', content: 'new' },
        updatedDiff: 'diff',
      });
    });
  });

  describe('applyInlineModify', () => {
    it('should return undefined if tool is not modifiable', async () => {
      vi.mocked(
        modifiableToolModule.isModifiableDeclarativeTool,
      ).mockReturnValue(false);

      const mockWaitingToolCall = createMockWaitingToolCall({
        tool: mockPlainTool,
      });

      const result = await handler.applyInlineModify(
        mockWaitingToolCall,
        { newContent: 'foo' },
        new AbortController().signal,
      );

      expect(result).toBeUndefined();
    });

    it('should return undefined if payload has no new content', async () => {
      vi.mocked(
        modifiableToolModule.isModifiableDeclarativeTool,
      ).mockReturnValue(true);

      const mockWaitingToolCall = createMockWaitingToolCall({
        tool: mockModifiableTool,
      });

      const result = await handler.applyInlineModify(
        mockWaitingToolCall,
        { newContent: undefined } as unknown as ToolConfirmationPayload,
        new AbortController().signal,
      );

      expect(result).toBeUndefined();
    });

    it('should calculate diff and return updated params', async () => {
      vi.mocked(
        modifiableToolModule.isModifiableDeclarativeTool,
      ).mockReturnValue(true);
      (Diff.createPatch as unknown as Mock).mockReturnValue('mock-diff');

      mockModifyContext.getCurrentContent.mockResolvedValue('old content');
      mockModifyContext.getFilePath.mockReturnValue('test.txt');
      mockModifyContext.createUpdatedParams.mockReturnValue({
        content: 'new content',
      });

      const mockWaitingToolCall = createMockWaitingToolCall({
        tool: mockModifiableTool,
        request: {
          callId: 'call-1',
          name: 'mockModifiableTool',
          args: { content: 'original' },
          isClientInitiated: false,
          prompt_id: 'p1',
        },
      });

      const result = await handler.applyInlineModify(
        mockWaitingToolCall,
        { newContent: 'new content' },
        new AbortController().signal,
      );

      expect(mockModifyContext.getCurrentContent).toHaveBeenCalled();
      expect(mockModifyContext.createUpdatedParams).toHaveBeenCalledWith(
        'old content',
        'new content',
        { content: 'original' },
      );
      expect(Diff.createPatch).toHaveBeenCalledWith(
        'test.txt',
        'old content',
        'new content',
        'Current',
        'Proposed',
      );

      expect(result).toEqual({
        updatedParams: { content: 'new content' },
        updatedDiff: 'mock-diff',
      });
    });
  });
});
