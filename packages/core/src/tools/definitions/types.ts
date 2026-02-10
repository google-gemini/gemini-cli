/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionDeclaration } from '@google/genai';

/**
 * Defines a tool's identity using a structured declaration.
 */
export interface ToolDefinition {
  /** The base declaration for the tool. */
  base: FunctionDeclaration;

  /**
   * Optional overrides for specific model families or versions.
   */
  overrides?: (modelId: string) => Partial<FunctionDeclaration> | undefined;
}
