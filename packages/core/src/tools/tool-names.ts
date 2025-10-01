/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Centralized constants for tool names.
// This prevents circular dependencies that can occur when other modules (like agents)
// need to reference a tool's name without importing the tool's implementation.

export const GLOB_TOOL_NAME = 'glob';

// TODO: Migrate other tool names here to follow this pattern and prevent future circular dependencies.
// Candidates for migration:
// - LSTool ('list_directory')
// - ReadFileTool ('read_file')
// - GrepTool ('search_file_content')
