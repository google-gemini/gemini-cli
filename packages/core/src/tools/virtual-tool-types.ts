/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration } from '@google/genai';

/**
 * Represents a single tool definition parsed from a GEMINI.md manifest.
 */
export interface VirtualToolDefinition {
  /** The name of the tool, extracted from the level-4 markdown header. */
  name: string;
  /** The full FunctionDeclaration schema, parsed from the `json` code block. */
  schema: FunctionDeclaration;
  /** The shell script content to be executed, from the `sh` code block. */
  script: string;
}
