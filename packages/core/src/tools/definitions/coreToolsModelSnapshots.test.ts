/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { resolveToolDeclaration } from './resolver.js';
import {
  READ_FILE_DEFINITION,
  WRITE_FILE_DEFINITION,
  GREP_DEFINITION,
  GLOB_DEFINITION,
  LS_DEFINITION,
  getShellDefinition,
} from './coreTools.js';

describe('coreTools snapshots for specific models', () => {
  const modelIds = ['gemini-2.5-pro', 'gemini-3-pro-preview'];
  const tools = [
    { name: 'read_file', definition: READ_FILE_DEFINITION },
    { name: 'write_file', definition: WRITE_FILE_DEFINITION },
    { name: 'grep_search', definition: GREP_DEFINITION },
    { name: 'glob', definition: GLOB_DEFINITION },
    { name: 'list_directory', definition: LS_DEFINITION },
    {
      name: 'run_shell_command',
      definition: getShellDefinition(true, true),
    },
  ];

  for (const modelId of modelIds) {
    describe(`Model: ${modelId}`, () => {
      for (const tool of tools) {
        it(`snapshot for tool: ${tool.name}`, () => {
          const resolved = resolveToolDeclaration(tool.definition, modelId);
          expect(resolved).toMatchSnapshot();
        });
      }
    });
  }
});
