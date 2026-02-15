/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import {
  doesToolInvocationMatch,
  getToolSuggestion,
  shouldHideToolCall,
} from './tool-utils.js';
import type { AnyToolInvocation, Config } from '../index.js';
import {
  ReadFileTool,
  ApprovalMode,
  CoreToolCallStatus,
  ASK_USER_DISPLAY_NAME,
  WRITE_FILE_DISPLAY_NAME,
  EDIT_DISPLAY_NAME,
  READ_FILE_DISPLAY_NAME,
} from '../index.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('shouldHideToolCall', () => {
  it.each([
    {
      status: CoreToolCallStatus.Scheduled,
      hasResult: true,
      shouldHide: true,
    },
    {
      status: CoreToolCallStatus.Executing,
      hasResult: true,
      shouldHide: true,
    },
    {
      status: CoreToolCallStatus.AwaitingApproval,
      hasResult: true,
      shouldHide: true,
    },
    {
      status: CoreToolCallStatus.Validating,
      hasResult: true,
      shouldHide: true,
    },
    {
      status: CoreToolCallStatus.Success,
      hasResult: true,
      shouldHide: false,
    },
    {
      status: CoreToolCallStatus.Error,
      hasResult: false,
      shouldHide: true,
    },
    {
      status: CoreToolCallStatus.Error,
      hasResult: true,
      shouldHide: false,
    },
  ])(
    'AskUser: status=$status, hasResult=$hasResult -> hide=$shouldHide',
    ({ status, hasResult, shouldHide }) => {
      expect(
        shouldHideToolCall({
          displayName: ASK_USER_DISPLAY_NAME,
          status,
          hasResultDisplay: hasResult,
        }),
      ).toBe(shouldHide);
    },
  );

  it.each([
    {
      name: WRITE_FILE_DISPLAY_NAME,
      mode: ApprovalMode.PLAN,
      visible: false,
    },
    { name: EDIT_DISPLAY_NAME, mode: ApprovalMode.PLAN, visible: false },
    {
      name: WRITE_FILE_DISPLAY_NAME,
      mode: ApprovalMode.DEFAULT,
      visible: true,
    },
    { name: READ_FILE_DISPLAY_NAME, mode: ApprovalMode.PLAN, visible: true },
  ])(
    'Plan Mode: tool=$name, mode=$mode -> visible=$visible',
    ({ name, mode, visible }) => {
      expect(
        shouldHideToolCall({
          displayName: name,
          status: CoreToolCallStatus.Success,
          approvalMode: mode,
          hasResultDisplay: true,
        }),
      ).toBe(!visible);
    },
  );
});

describe('getToolSuggestion', () => {
  it('should suggest the top N closest tool names for a typo', () => {
    const allToolNames = ['list_files', 'read_file', 'write_file'];

    // Test that the right tool is selected, with only 1 result, for typos
    const misspelledTool = getToolSuggestion('list_fils', allToolNames, 1);
    expect(misspelledTool).toBe(' Did you mean "list_files"?');

    // Test that the right tool is selected, with only 1 result, for prefixes
    const prefixedTool = getToolSuggestion(
      'github.list_files',
      allToolNames,
      1,
    );
    expect(prefixedTool).toBe(' Did you mean "list_files"?');

    // Test that the right tool is first
    const suggestionMultiple = getToolSuggestion('list_fils', allToolNames);
    expect(suggestionMultiple).toBe(
      ' Did you mean one of: "list_files", "read_file", "write_file"?',
    );
  });
});

describe('doesToolInvocationMatch', () => {
  it('should not match a partial command prefix', () => {
    const invocation = {
      params: { command: 'git commitsomething' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(git commit)'];
    const result = doesToolInvocationMatch(
      'run_shell_command',
      invocation,
      patterns,
    );
    expect(result).toBe(false);
  });

  it('should match an exact command', () => {
    const invocation = {
      params: { command: 'git status' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(git status)'];
    const result = doesToolInvocationMatch(
      'run_shell_command',
      invocation,
      patterns,
    );
    expect(result).toBe(true);
  });

  it('should match a command with an alias', () => {
    const invocation = {
      params: { command: 'wc -l' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(wc)'];
    const result = doesToolInvocationMatch('ShellTool', invocation, patterns);
    expect(result).toBe(true);
  });

  it('should match a command that is a prefix', () => {
    const invocation = {
      params: { command: 'git status -v' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(git status)'];
    const result = doesToolInvocationMatch(
      'run_shell_command',
      invocation,
      patterns,
    );
    expect(result).toBe(true);
  });

  describe('for non-shell tools', () => {
    const mockConfig = {
      getTargetDir: () => '/tmp',
      getFileFilteringOptions: () => ({}),
    } as unknown as Config;
    const readFileTool = new ReadFileTool(mockConfig, createMockMessageBus());
    const invocation = {
      params: { file: 'test.txt' },
    } as AnyToolInvocation;

    it('should match by tool name', () => {
      const patterns = ['read_file'];
      const result = doesToolInvocationMatch(
        readFileTool,
        invocation,
        patterns,
      );
      expect(result).toBe(true);
    });

    it('should match by tool class name', () => {
      const patterns = ['ReadFileTool'];
      const result = doesToolInvocationMatch(
        readFileTool,
        invocation,
        patterns,
      );
      expect(result).toBe(true);
    });

    it('should not match if neither name is in the patterns', () => {
      const patterns = ['some_other_tool', 'AnotherToolClass'];
      const result = doesToolInvocationMatch(
        readFileTool,
        invocation,
        patterns,
      );
      expect(result).toBe(false);
    });

    it('should match by tool name when passed as a string', () => {
      const patterns = ['read_file'];
      const result = doesToolInvocationMatch('read_file', invocation, patterns);
      expect(result).toBe(true);
    });
  });
});
