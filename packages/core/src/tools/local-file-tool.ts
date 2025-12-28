/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AnyDeclarativeTool,
  DeclarativeTool,
  ToolResult,
} from './tools.js';

/**
 * A declarative tool that may access local files.
 * If DeclarativeTool.kind is Execute, access means executing commands in the local file system.
 */
export interface LocalFileDeclarativeTool<TParams extends object>
  extends DeclarativeTool<TParams, ToolResult> {
  accessesLocalFiles: true;
}

/**
 * Type guard to check if a declarative tool is local file accessible.
 */
export function isLocalFileDeclarativeTool(
  tool: AnyDeclarativeTool,
): tool is LocalFileDeclarativeTool<object> {
  return (tool as LocalFileDeclarativeTool<object>).accessesLocalFiles === true;
}
