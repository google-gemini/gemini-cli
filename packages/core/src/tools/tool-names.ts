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

// TODO: Migrate other tool names here to follow this pattern and prevent future circular dependencies.
// Candidates for migration:
// - LSTool ('list_directory')
// - ReadFileTool ('read_file')
// - GrepTool ('search_file_content')
