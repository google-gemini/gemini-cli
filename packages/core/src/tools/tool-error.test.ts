/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  ToolErrorType,
  isFatalToolError,
  getRecoveryHint,
} from './tool-error.js';

describe('isFatalToolError', () => {
  it('should return true for NO_SPACE_LEFT', () => {
    expect(isFatalToolError(ToolErrorType.NO_SPACE_LEFT)).toBe(true);
  });

  it('should return false for recoverable errors', () => {
    expect(isFatalToolError(ToolErrorType.FILE_NOT_FOUND)).toBe(false);
    expect(isFatalToolError(ToolErrorType.PERMISSION_DENIED)).toBe(false);
    expect(isFatalToolError(ToolErrorType.INVALID_TOOL_PARAMS)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isFatalToolError(undefined)).toBe(false);
  });
});

describe('getRecoveryHint', () => {
  it('should return specific hint for FILE_NOT_FOUND', () => {
    expect(getRecoveryHint(ToolErrorType.FILE_NOT_FOUND)).toBe(
      'Verify the file path exists. Use glob or list_directory to find the correct path.',
    );
  });

  it('should return specific hint for PERMISSION_DENIED', () => {
    expect(getRecoveryHint(ToolErrorType.PERMISSION_DENIED)).toBe(
      'The path is not accessible. Try a different path within the workspace.',
    );
  });

  it('should return specific hint for PATH_NOT_IN_WORKSPACE', () => {
    expect(getRecoveryHint(ToolErrorType.PATH_NOT_IN_WORKSPACE)).toBe(
      'The path is outside the allowed workspace. Use a path within the project directory.',
    );
  });

  it('should return specific hint for INVALID_TOOL_PARAMS', () => {
    expect(getRecoveryHint(ToolErrorType.INVALID_TOOL_PARAMS)).toBe(
      'Check the parameter types and required fields against the tool schema.',
    );
  });

  it('should return specific hint for EDIT_NO_OCCURRENCE_FOUND', () => {
    expect(getRecoveryHint(ToolErrorType.EDIT_NO_OCCURRENCE_FOUND)).toBe(
      'The old_string was not found. Use read_file to verify the exact content, including whitespace and indentation.',
    );
  });

  it('should return specific hint for EDIT_EXPECTED_OCCURRENCE_MISMATCH', () => {
    expect(
      getRecoveryHint(ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH),
    ).toBe(
      'Multiple occurrences found. Set allow_multiple to true, or use a more specific old_string.',
    );
  });

  it('should return specific hint for SHELL_EXECUTE_ERROR', () => {
    expect(getRecoveryHint(ToolErrorType.SHELL_EXECUTE_ERROR)).toBe(
      'The command failed. Check the error output and adjust the command.',
    );
  });

  it('should return specific hint for NO_SPACE_LEFT', () => {
    expect(getRecoveryHint(ToolErrorType.NO_SPACE_LEFT)).toBe(
      'The disk is full. Cannot write files until space is freed.',
    );
  });

  it('should return specific hint for GREP_EXECUTION_ERROR', () => {
    expect(getRecoveryHint(ToolErrorType.GREP_EXECUTION_ERROR)).toBe(
      'The search failed. Check the pattern syntax and search path.',
    );
  });

  it('should return specific hint for GLOB_EXECUTION_ERROR', () => {
    expect(getRecoveryHint(ToolErrorType.GLOB_EXECUTION_ERROR)).toBe(
      'The glob pattern failed. Check the pattern syntax.',
    );
  });

  it('should return default hint for unmapped error types', () => {
    const defaultHint = 'Review the error message and adjust your approach.';
    expect(getRecoveryHint(ToolErrorType.UNKNOWN)).toBe(defaultHint);
    expect(getRecoveryHint(ToolErrorType.UNHANDLED_EXCEPTION)).toBe(
      defaultHint,
    );
    expect(getRecoveryHint(ToolErrorType.MCP_TOOL_ERROR)).toBe(defaultHint);
  });
});
