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
  extensionFolder: {
    type: 'string',
    description: 'The folder for this extension.',
  },
  extensionsDir: {
    type: 'string',
    description:
      'The top-level extension directory where this extension is stored.',
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
