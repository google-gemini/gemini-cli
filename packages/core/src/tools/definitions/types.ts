/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type FunctionDeclaration } from '@google/genai';

/**
 * Defines a tool's identity with potential model-specific flavor variants.
 */
export interface ToolDefinition {
  /** The base declaration used by default. */
  base: FunctionDeclaration;

  /**
   * Model-specific overrides for the tool declaration.
   * Can override description, parameters, or any other field.
   */
  variants?: {
    flash?: Partial<FunctionDeclaration>;
    pro?: Partial<FunctionDeclaration>;
    [modelKey: string]: Partial<FunctionDeclaration> | undefined;
  };
}
