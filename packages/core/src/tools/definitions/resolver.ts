/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionDeclaration } from '@google/genai';
import type { ToolDefinition } from './types.js';

/**
 * Resolves the declaration for a tool.
 *
 * @param definition The tool definition containing the base declaration.
 * @param _modelId Optional model identifier (ignored in this plain refactor).
 * @returns The FunctionDeclaration to be sent to the API.
 */
export function resolveToolDeclaration(
  definition: ToolDefinition,
  _modelId?: string,
): FunctionDeclaration {
  return definition.base;
}
