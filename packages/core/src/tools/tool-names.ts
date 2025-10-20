/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Centralized constants for tool names.
// This prevents circular dependencies that can occur when other modules (like agents)
// need to reference a tool's name without importing the tool's implementation.

export const GLOB_TOOL_NAME = 'glob';
export const WRITE_TODOS_TOOL_NAME = 'write_todos';
export const WRITE_FILE_TOOL_NAME = 'write_file';
export const WEB_SEARCH_TOOL_NAME = 'google_web_search';
export const WEB_FETCH_TOOL_NAME = 'web_fetch';
export const EDIT_TOOL_NAME = 'replace';
export const SHELL_TOOL_NAME = 'run_shell_command';
export const GREP_TOOL_NAME = 'search_file_content';
export const READ_MANY_FILES_TOOL_NAME = 'read_many_files';
export const READ_FILE_TOOL_NAME = 'read_file';
export const LS_TOOL_NAME = 'list_directory';
export const MEMORY_TOOL_NAME = 'save_memory';
