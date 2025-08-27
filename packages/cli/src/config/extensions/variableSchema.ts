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

const PATH_SEPARATOR_DEFINITION = {
  type: 'string',
  description: 'The path separator.',
} as const;

export const VARIABLE_SCHEMA = {
  extensionPath: {
    type: 'string',
    description: 'The path of the extension in the filesystem.',
  },
  '/': PATH_SEPARATOR_DEFINITION,
  pathSeparator: PATH_SEPARATOR_DEFINITION,
} as const;
