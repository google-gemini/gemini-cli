/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCallEvent } from './types.js';
import { getLanguageFromFilePath } from '../utils/language-detection.js';

export function addProgrammingLanguageToEvent(
  event: ToolCallEvent,
): ToolCallEvent {
  // Logging programming_language for replace, write_file, and read_file function calls.
  if (event.function_args) {
    const filePath =
      event.function_args.file_path || event.function_args.absolute_path;
    if (typeof filePath === 'string') {
      event.programming_language = getLanguageFromFilePath(filePath);
    }
  }
  return event;
}
