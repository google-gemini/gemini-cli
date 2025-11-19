/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EDIT_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  WRITE_TODOS_TOOL_NAME,
  SHELL_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  LS_TOOL_NAME,
  MEMORY_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from './tool-names.js';

/**
 * Tools that modify the filesystem or execute potentially dangerous operations.
 * These tools should be blocked in plan mode to ensure safe exploration.
 */
export const DESTRUCTIVE_TOOLS = new Set<string>([
  EDIT_TOOL_NAME, // 'replace' - modifies file contents
  WRITE_FILE_TOOL_NAME, // 'write_file' - creates or overwrites files
  WRITE_TODOS_TOOL_NAME, // 'write_todos' - creates todo files
  SHELL_TOOL_NAME, // 'run_shell_command' - can execute dangerous commands
]);

/**
 * Tools that only read data without modifying the system.
 * These tools are safe to use in plan mode.
 */
export const READ_ONLY_TOOLS = new Set<string>([
  READ_FILE_TOOL_NAME, // 'read_file'
  READ_MANY_FILES_TOOL_NAME, // 'read_many_files'
  GREP_TOOL_NAME, // 'search_file_content'
  GLOB_TOOL_NAME, // 'glob'
  LS_TOOL_NAME, // 'list_directory'
  MEMORY_TOOL_NAME, // 'save_memory'
  WEB_FETCH_TOOL_NAME, // 'web_fetch'
  WEB_SEARCH_TOOL_NAME, // 'google_web_search'
]);

/**
 * Determines if a tool is destructive (modifies system state).
 * @param toolName - The name of the tool to check
 * @returns true if the tool is destructive, false otherwise
 */
export function isDestructiveTool(toolName: string): boolean {
  return DESTRUCTIVE_TOOLS.has(toolName);
}

/**
 * Determines if a tool is read-only (safe for plan mode).
 * @param toolName - The name of the tool to check
 * @returns true if the tool is read-only, false otherwise
 */
export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOLS.has(toolName);
}
