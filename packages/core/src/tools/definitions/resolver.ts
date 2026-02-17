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
 * @returns An object containing the FunctionDeclaration for the API and optional instructions for the system prompt.
 */
export function resolveToolDeclaration(
  definition: ToolDefinition,
  modelId?: string,
): { declaration: FunctionDeclaration; instructions?: string } {
  const { instructions: baseInstructions, ...baseDeclaration } =
    definition.base;

  if (!modelId || !definition.overrides) {
    return {
      declaration: baseDeclaration,
      instructions: baseInstructions,
    };
  }

  const override = definition.overrides(modelId);
  if (!override) {
    return {
      declaration: baseDeclaration,
      instructions: baseInstructions,
    };
  }

  const { instructions: overrideInstructions, ...overrideDeclaration } =
    override;

  return {
    declaration: {
      ...baseDeclaration,
      ...overrideDeclaration,
    },
    instructions: overrideInstructions ?? baseInstructions,
  };
}
