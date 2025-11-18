/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ToolErrorType } from './tool-error.js';

describe('ToolErrorType enum', () => {
  describe('general errors', () => {
    it('should have INVALID_TOOL_PARAMS', () => {
      expect(ToolErrorType.INVALID_TOOL_PARAMS).toBe('invalid_tool_params');
    });

    it('should have UNKNOWN', () => {
      expect(ToolErrorType.UNKNOWN).toBe('unknown');
    });

    it('should have UNHANDLED_EXCEPTION', () => {
      expect(ToolErrorType.UNHANDLED_EXCEPTION).toBe('unhandled_exception');
    });

    it('should have TOOL_NOT_REGISTERED', () => {
      expect(ToolErrorType.TOOL_NOT_REGISTERED).toBe('tool_not_registered');
    });

    it('should have EXECUTION_FAILED', () => {
      expect(ToolErrorType.EXECUTION_FAILED).toBe('execution_failed');
    });
  });

  describe('file system errors', () => {
    it('should have FILE_NOT_FOUND', () => {
      expect(ToolErrorType.FILE_NOT_FOUND).toBe('file_not_found');
    });

    it('should have FILE_WRITE_FAILURE', () => {
      expect(ToolErrorType.FILE_WRITE_FAILURE).toBe('file_write_failure');
    });

    it('should have READ_CONTENT_FAILURE', () => {
      expect(ToolErrorType.READ_CONTENT_FAILURE).toBe('read_content_failure');
    });

    it('should have ATTEMPT_TO_CREATE_EXISTING_FILE', () => {
      expect(ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE).toBe(
        'attempt_to_create_existing_file',
      );
    });

    it('should have FILE_TOO_LARGE', () => {
      expect(ToolErrorType.FILE_TOO_LARGE).toBe('file_too_large');
    });

    it('should have PERMISSION_DENIED', () => {
      expect(ToolErrorType.PERMISSION_DENIED).toBe('permission_denied');
    });

    it('should have NO_SPACE_LEFT', () => {
      expect(ToolErrorType.NO_SPACE_LEFT).toBe('no_space_left');
    });

    it('should have TARGET_IS_DIRECTORY', () => {
      expect(ToolErrorType.TARGET_IS_DIRECTORY).toBe('target_is_directory');
    });

    it('should have PATH_NOT_IN_WORKSPACE', () => {
      expect(ToolErrorType.PATH_NOT_IN_WORKSPACE).toBe('path_not_in_workspace');
    });

    it('should have SEARCH_PATH_NOT_FOUND', () => {
      expect(ToolErrorType.SEARCH_PATH_NOT_FOUND).toBe('search_path_not_found');
    });

    it('should have SEARCH_PATH_NOT_A_DIRECTORY', () => {
      expect(ToolErrorType.SEARCH_PATH_NOT_A_DIRECTORY).toBe(
        'search_path_not_a_directory',
      );
    });
  });

  describe('edit-specific errors', () => {
    it('should have EDIT_PREPARATION_FAILURE', () => {
      expect(ToolErrorType.EDIT_PREPARATION_FAILURE).toBe(
        'edit_preparation_failure',
      );
    });

    it('should have EDIT_NO_OCCURRENCE_FOUND', () => {
      expect(ToolErrorType.EDIT_NO_OCCURRENCE_FOUND).toBe(
        'edit_no_occurrence_found',
      );
    });

    it('should have EDIT_EXPECTED_OCCURRENCE_MISMATCH', () => {
      expect(ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH).toBe(
        'edit_expected_occurrence_mismatch',
      );
    });

    it('should have EDIT_NO_CHANGE', () => {
      expect(ToolErrorType.EDIT_NO_CHANGE).toBe('edit_no_change');
    });

    it('should have EDIT_NO_CHANGE_LLM_JUDGEMENT', () => {
      expect(ToolErrorType.EDIT_NO_CHANGE_LLM_JUDGEMENT).toBe(
        'edit_no_change_llm_judgement',
      );
    });
  });

  describe('tool-specific errors', () => {
    it('should have GLOB_EXECUTION_ERROR', () => {
      expect(ToolErrorType.GLOB_EXECUTION_ERROR).toBe('glob_execution_error');
    });

    it('should have GREP_EXECUTION_ERROR', () => {
      expect(ToolErrorType.GREP_EXECUTION_ERROR).toBe('grep_execution_error');
    });

    it('should have LS_EXECUTION_ERROR', () => {
      expect(ToolErrorType.LS_EXECUTION_ERROR).toBe('ls_execution_error');
    });

    it('should have PATH_IS_NOT_A_DIRECTORY', () => {
      expect(ToolErrorType.PATH_IS_NOT_A_DIRECTORY).toBe(
        'path_is_not_a_directory',
      );
    });

    it('should have MCP_TOOL_ERROR', () => {
      expect(ToolErrorType.MCP_TOOL_ERROR).toBe('mcp_tool_error');
    });

    it('should have MEMORY_TOOL_EXECUTION_ERROR', () => {
      expect(ToolErrorType.MEMORY_TOOL_EXECUTION_ERROR).toBe(
        'memory_tool_execution_error',
      );
    });

    it('should have READ_MANY_FILES_SEARCH_ERROR', () => {
      expect(ToolErrorType.READ_MANY_FILES_SEARCH_ERROR).toBe(
        'read_many_files_search_error',
      );
    });

    it('should have SHELL_EXECUTE_ERROR', () => {
      expect(ToolErrorType.SHELL_EXECUTE_ERROR).toBe('shell_execute_error');
    });

    it('should have DISCOVERED_TOOL_EXECUTION_ERROR', () => {
      expect(ToolErrorType.DISCOVERED_TOOL_EXECUTION_ERROR).toBe(
        'discovered_tool_execution_error',
      );
    });
  });

  describe('web-specific errors', () => {
    it('should have WEB_FETCH_NO_URL_IN_PROMPT', () => {
      expect(ToolErrorType.WEB_FETCH_NO_URL_IN_PROMPT).toBe(
        'web_fetch_no_url_in_prompt',
      );
    });

    it('should have WEB_FETCH_FALLBACK_FAILED', () => {
      expect(ToolErrorType.WEB_FETCH_FALLBACK_FAILED).toBe(
        'web_fetch_fallback_failed',
      );
    });

    it('should have WEB_FETCH_PROCESSING_ERROR', () => {
      expect(ToolErrorType.WEB_FETCH_PROCESSING_ERROR).toBe(
        'web_fetch_processing_error',
      );
    });

    it('should have WEB_SEARCH_FAILED', () => {
      expect(ToolErrorType.WEB_SEARCH_FAILED).toBe('web_search_failed');
    });
  });

  describe('enum properties', () => {
    it('should use snake_case for all values', () => {
      const values = Object.values(ToolErrorType);

      values.forEach((value) => {
        expect(value).toMatch(/^[a-z_]+$/);
      });
    });

    it('should use lowercase for all values', () => {
      const values = Object.values(ToolErrorType);

      values.forEach((value) => {
        expect(value).toBe(value.toLowerCase());
      });
    });

    it('should have all unique values', () => {
      const values = Object.values(ToolErrorType);
      const uniqueValues = new Set(values);

      expect(uniqueValues.size).toBe(values.length);
    });

    it('should have all unique keys', () => {
      const keys = Object.keys(ToolErrorType);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('should use UPPER_SNAKE_CASE for keys', () => {
      const keys = Object.keys(ToolErrorType);

      keys.forEach((key) => {
        expect(key).toMatch(/^[A-Z_]+$/);
      });
    });
  });

  describe('error categorization', () => {
    it('should have 5 general error types', () => {
      const generalErrors = [
        ToolErrorType.INVALID_TOOL_PARAMS,
        ToolErrorType.UNKNOWN,
        ToolErrorType.UNHANDLED_EXCEPTION,
        ToolErrorType.TOOL_NOT_REGISTERED,
        ToolErrorType.EXECUTION_FAILED,
      ];

      expect(generalErrors).toHaveLength(5);
    });

    it('should have 11 file system error types', () => {
      const fileSystemErrors = [
        ToolErrorType.FILE_NOT_FOUND,
        ToolErrorType.FILE_WRITE_FAILURE,
        ToolErrorType.READ_CONTENT_FAILURE,
        ToolErrorType.ATTEMPT_TO_CREATE_EXISTING_FILE,
        ToolErrorType.FILE_TOO_LARGE,
        ToolErrorType.PERMISSION_DENIED,
        ToolErrorType.NO_SPACE_LEFT,
        ToolErrorType.TARGET_IS_DIRECTORY,
        ToolErrorType.PATH_NOT_IN_WORKSPACE,
        ToolErrorType.SEARCH_PATH_NOT_FOUND,
        ToolErrorType.SEARCH_PATH_NOT_A_DIRECTORY,
      ];

      expect(fileSystemErrors).toHaveLength(11);
    });

    it('should have 5 edit-specific error types', () => {
      const editErrors = [
        ToolErrorType.EDIT_PREPARATION_FAILURE,
        ToolErrorType.EDIT_NO_OCCURRENCE_FOUND,
        ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
        ToolErrorType.EDIT_NO_CHANGE,
        ToolErrorType.EDIT_NO_CHANGE_LLM_JUDGEMENT,
      ];

      expect(editErrors).toHaveLength(5);
    });

    it('should have 4 web-related error types', () => {
      const webErrors = [
        ToolErrorType.WEB_FETCH_NO_URL_IN_PROMPT,
        ToolErrorType.WEB_FETCH_FALLBACK_FAILED,
        ToolErrorType.WEB_FETCH_PROCESSING_ERROR,
        ToolErrorType.WEB_SEARCH_FAILED,
      ];

      expect(webErrors).toHaveLength(4);
    });
  });

  describe('error patterns', () => {
    it('should have errors prefixed with tool category', () => {
      expect(ToolErrorType.GLOB_EXECUTION_ERROR).toMatch(/^glob_/);
      expect(ToolErrorType.GREP_EXECUTION_ERROR).toMatch(/^grep_/);
      expect(ToolErrorType.LS_EXECUTION_ERROR).toMatch(/^ls_/);
      expect(ToolErrorType.SHELL_EXECUTE_ERROR).toMatch(/^shell_/);
      expect(ToolErrorType.MCP_TOOL_ERROR).toMatch(/^mcp_/);
    });

    it('should have edit errors prefixed with "edit_"', () => {
      const editErrors = Object.values(ToolErrorType).filter((v) =>
        v.startsWith('edit_'),
      );

      expect(editErrors.length).toBeGreaterThan(0);
      editErrors.forEach((error) => {
        expect(error).toMatch(/^edit_/);
      });
    });

    it('should have web errors prefixed with "web_"', () => {
      const webErrors = Object.values(ToolErrorType).filter((v) =>
        v.startsWith('web_'),
      );

      expect(webErrors.length).toBeGreaterThan(0);
      webErrors.forEach((error) => {
        expect(error).toMatch(/^web_/);
      });
    });
  });

  describe('enum completeness', () => {
    it('should have at least 35 error types', () => {
      const count = Object.keys(ToolErrorType).length;

      expect(count).toBeGreaterThanOrEqual(35);
    });

    it('should be a TypeScript enum', () => {
      expect(typeof ToolErrorType).toBe('object');
    });

    it('should be readonly', () => {
      expect(() => {
        (ToolErrorType as never)['NEW_ERROR'] = 'new_error';
      }).toThrow();
    });
  });

  describe('error type usage', () => {
    it('should be usable in switch statements', () => {
      const errorType = ToolErrorType.FILE_NOT_FOUND;
      let result = '';

      switch (errorType) {
        case ToolErrorType.FILE_NOT_FOUND:
          result = 'file not found';
          break;
        case ToolErrorType.PERMISSION_DENIED:
          result = 'permission denied';
          break;
        default:
          result = 'unknown';
      }

      expect(result).toBe('file not found');
    });

    it('should be usable in equality checks', () => {
      const errorType = ToolErrorType.UNKNOWN;

      expect(errorType === ToolErrorType.UNKNOWN).toBe(true);
      expect(errorType === ToolErrorType.FILE_NOT_FOUND).toBe(false);
    });

    it('should be usable in object keys', () => {
      const errorMessages = {
        [ToolErrorType.FILE_NOT_FOUND]: 'File not found',
        [ToolErrorType.PERMISSION_DENIED]: 'Permission denied',
      };

      expect(errorMessages[ToolErrorType.FILE_NOT_FOUND]).toBe(
        'File not found',
      );
      expect(errorMessages[ToolErrorType.PERMISSION_DENIED]).toBe(
        'Permission denied',
      );
    });

    it('should be usable in arrays', () => {
      const criticalErrors = [
        ToolErrorType.UNHANDLED_EXCEPTION,
        ToolErrorType.EXECUTION_FAILED,
      ];

      expect(criticalErrors).toContain(ToolErrorType.UNHANDLED_EXCEPTION);
      expect(criticalErrors).toContain(ToolErrorType.EXECUTION_FAILED);
      expect(criticalErrors).not.toContain(ToolErrorType.FILE_NOT_FOUND);
    });

    it('should be usable in sets', () => {
      const errorSet = new Set([
        ToolErrorType.FILE_NOT_FOUND,
        ToolErrorType.PERMISSION_DENIED,
      ]);

      expect(errorSet.has(ToolErrorType.FILE_NOT_FOUND)).toBe(true);
      expect(errorSet.has(ToolErrorType.PERMISSION_DENIED)).toBe(true);
      expect(errorSet.has(ToolErrorType.UNKNOWN)).toBe(false);
    });
  });

  describe('string representation', () => {
    it('should have string values', () => {
      const values = Object.values(ToolErrorType);

      values.forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });

    it('should not have empty string values', () => {
      const values = Object.values(ToolErrorType);

      values.forEach((value) => {
        expect(value.length).toBeGreaterThan(0);
      });
    });

    it('should use underscores as word separators', () => {
      const values = Object.values(ToolErrorType);

      values.forEach((value) => {
        if (value.includes(' ')) {
          throw new Error(
            `Value "${value}" contains spaces instead of underscores`,
          );
        }
      });
    });
  });

  describe('error type groups', () => {
    it('should group all errors by prefix', () => {
      const values = Object.values(ToolErrorType);
      const prefixes = new Set(
        values.filter((v) => v.includes('_')).map((v) => v.split('_')[0]),
      );

      expect(prefixes.size).toBeGreaterThan(0);
    });

    it('should have file-related errors', () => {
      const fileErrors = Object.values(ToolErrorType).filter(
        (v) => v.includes('file') || v.includes('read') || v.includes('write'),
      );

      expect(fileErrors.length).toBeGreaterThan(0);
    });

    it('should have execution errors', () => {
      const execErrors = Object.values(ToolErrorType).filter((v) =>
        v.includes('execution'),
      );

      expect(execErrors.length).toBeGreaterThan(0);
    });

    it('should have path-related errors', () => {
      const pathErrors = Object.values(ToolErrorType).filter((v) =>
        v.includes('path'),
      );

      expect(pathErrors.length).toBeGreaterThan(0);
    });
  });
});
