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
 * @param definition The tool definition containing the base declaration and optional overrides.
 * @param modelId Optional model identifier to apply specific overrides.
 * @returns The FunctionDeclaration to be sent to the API.
 */
export function resolveToolDeclaration(
  definition: ToolDefinition,
  modelId?: string,
): FunctionDeclaration {
  if (!modelId || !definition.overrides) {
    return definition.base;
  }

  const override = definition.overrides(modelId);
  if (!override) {
    return definition.base;
  }

  return {
    ...definition.base,
    ...override,
  };
}
