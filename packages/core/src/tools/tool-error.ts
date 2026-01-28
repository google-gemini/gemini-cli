/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A type-safe enum for tool-related errors.
 *
 * Error types are categorized as:
 * - Recoverable: LLM can self-correct (e.g., invalid params, file not found)
 * - Fatal: System-level issues that prevent continued execution (e.g., disk full, critical I/O errors)
 */
export enum ToolErrorType {
  POLICY_VIOLATION = 'policy_violation',
  /**
   * General tool execution failure (e.g. file system error, API error).
   */
  // General Errors
  INVALID_TOOL_PARAMS = 'invalid_tool_params',
  UNKNOWN = 'unknown',
  UNHANDLED_EXCEPTION = 'unhandled_exception',
  TOOL_NOT_REGISTERED = 'tool_not_registered',
  EXECUTION_FAILED = 'execution_failed',

  // File System Errors
  FILE_NOT_FOUND = 'file_not_found',
  FILE_WRITE_FAILURE = 'file_write_failure',
  READ_CONTENT_FAILURE = 'read_content_failure',
  ATTEMPT_TO_CREATE_EXISTING_FILE = 'attempt_to_create_existing_file',
  FILE_TOO_LARGE = 'file_too_large',
  PERMISSION_DENIED = 'permission_denied',
  NO_SPACE_LEFT = 'no_space_left',
  TARGET_IS_DIRECTORY = 'target_is_directory',
  PATH_NOT_IN_WORKSPACE = 'path_not_in_workspace',
  SEARCH_PATH_NOT_FOUND = 'search_path_not_found',
  SEARCH_PATH_NOT_A_DIRECTORY = 'search_path_not_a_directory',

  // Edit-specific Errors
  EDIT_PREPARATION_FAILURE = 'edit_preparation_failure',
  EDIT_NO_OCCURRENCE_FOUND = 'edit_no_occurrence_found',
  EDIT_EXPECTED_OCCURRENCE_MISMATCH = 'edit_expected_occurrence_mismatch',
  EDIT_NO_CHANGE = 'edit_no_change',
  EDIT_NO_CHANGE_LLM_JUDGEMENT = 'edit_no_change_llm_judgement',

  // Glob-specific Errors
  GLOB_EXECUTION_ERROR = 'glob_execution_error',

  // Grep-specific Errors
  GREP_EXECUTION_ERROR = 'grep_execution_error',

  // Ls-specific Errors
  LS_EXECUTION_ERROR = 'ls_execution_error',
  PATH_IS_NOT_A_DIRECTORY = 'path_is_not_a_directory',

  // MCP-specific Errors
  MCP_TOOL_ERROR = 'mcp_tool_error',

  // Memory-specific Errors
  MEMORY_TOOL_EXECUTION_ERROR = 'memory_tool_execution_error',

  // ReadManyFiles-specific Errors
  READ_MANY_FILES_SEARCH_ERROR = 'read_many_files_search_error',

  // Shell errors
  SHELL_EXECUTE_ERROR = 'shell_execute_error',

  // DiscoveredTool-specific Errors
  DISCOVERED_TOOL_EXECUTION_ERROR = 'discovered_tool_execution_error',

  // WebFetch-specific Errors
  WEB_FETCH_NO_URL_IN_PROMPT = 'web_fetch_no_url_in_prompt',
  WEB_FETCH_FALLBACK_FAILED = 'web_fetch_fallback_failed',
  WEB_FETCH_PROCESSING_ERROR = 'web_fetch_processing_error',

  // WebSearch-specific Errors
  WEB_SEARCH_FAILED = 'web_search_failed',

  // Hook-specific Errors
  STOP_EXECUTION = 'stop_execution',
}

/**
 * Determines if a tool error type should be treated as fatal.
 *
 * Fatal errors are system-level issues that indicate the environment is in a bad state
 * and continued execution is unlikely to succeed. These include:
 * - Disk space issues (NO_SPACE_LEFT)
 *
 * Non-fatal errors are issues the LLM can potentially recover from by:
 * - Correcting invalid parameters (INVALID_TOOL_PARAMS)
 * - Trying different files (FILE_NOT_FOUND)
 * - Respecting security boundaries (PATH_NOT_IN_WORKSPACE, PERMISSION_DENIED)
 * - Using different tools or approaches
 *
 * @param errorType - The tool error type to check
 * @returns true if the error should cause the CLI to exit, false if it's recoverable
 */
export function isFatalToolError(errorType?: string): boolean {
  if (!errorType) {
    return false;
  }

  const fatalErrors = new Set<string>([ToolErrorType.NO_SPACE_LEFT]);

  return fatalErrors.has(errorType);
}
