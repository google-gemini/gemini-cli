/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ToolInvocation,
  ToolResult,
  ToolResultDisplay,
} from '../tools/tools.js';
import type { ToolDisplay, DisplayContent } from './types.js';

/**
 * Populates a ToolDisplay object from a tool invocation and its result.
 * This serves as a centralized bridge during the migration to tool-controlled display.
 */
export function populateToolDisplay({
  name,
  invocation,
  resultDisplay,
  displayName,
}: {
  name: string;
  invocation?: ToolInvocation<object, ToolResult>;
  resultDisplay?: ToolResultDisplay;
  displayName?: string;
}): ToolDisplay {
  const display: ToolDisplay = {
    name: displayName || name,
    description: invocation?.getDescription?.(),
  };

  if (resultDisplay) {
    display.result = toolResultDisplayToDisplayContent(resultDisplay);
  }

  return display;
}

/**
 * Converts a legacy ToolResultDisplay into the new DisplayContent format.
 */
export function toolResultDisplayToDisplayContent(
  resultDisplay: ToolResultDisplay,
): DisplayContent {
  if (typeof resultDisplay === 'string') {
    return { type: 'text', text: resultDisplay };
  }

  // Handle FileDiff -> DisplayDiff
  if (
    typeof resultDisplay === 'object' &&
    resultDisplay !== null &&
    'fileDiff' in resultDisplay &&
    'newContent' in resultDisplay
  ) {
    return {
      type: 'diff',
      path: resultDisplay.filePath || resultDisplay.fileName,
      beforeText: resultDisplay.originalContent ?? '',
      afterText: resultDisplay.newContent,
    };
  }

  // Fallback for other structured types (LsTool, GrepTool, etc.)
  // These will be fully migrated in Step 5.
  return {
    type: 'text',
    text: JSON.stringify(resultDisplay),
  };
}
