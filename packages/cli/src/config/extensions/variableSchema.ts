/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VariableDefinition {
  type: 'string';
  description: string;
  default?: string;
  required?: boolean;
}

export interface VariableSchema {
  [key: string]: VariableDefinition;
}

export interface LoadExtensionContext {
  extensionDir: string;
  workspaceDir: string;
}

const PATH_SEPARATOR_DEFINITION = {
  type: 'string',
  description: 'The path separator (differs per OS).',
} as const;

export const VARIABLE_SCHEMA = {
  extensionPath: {
    type: 'string',
    description:
      "The fully-qualified path of the extension in the user's filesystem e.g., '/Users/username/.gemini/extensions/example-extension'. This will not unwrap symlinks.",
  },
  workspacePath: {
    type: 'string',
    description: 'The fully-qualified path of the current workspace.',
  },
  '/': PATH_SEPARATOR_DEFINITION,
  pathSeparator: PATH_SEPARATOR_DEFINITION,
} as const;
