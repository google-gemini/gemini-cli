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

export const VARIABLE_SCHEMA = {
  extensionPath: {
    type: 'string',
    description: 'The path of the extension in the filesystem.',
  },
  '/': {
    type: 'string',
    description: 'The path separator.',
  },
  pathSeparator: {
    type: 'string',
    description: 'The path separator.',
  },
} as const;
