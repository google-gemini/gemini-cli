/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveToolDeclaration } from './resolver.js';
import { WRITE_FILE_DEFINITION, getShellDefinition } from './coreTools.js';

describe('local gemma tool declarations', () => {
  it('uses the concise write_file declaration for local gemma models', () => {
    const declaration = resolveToolDeclaration(
      WRITE_FILE_DEFINITION,
      'gemma4:31b',
    );

    expect(declaration.description).toContain(
      'Create a new file or fully rewrite an existing file.',
    );
    expect(declaration.description).toContain(
      'Use this immediately when the user asks you to create a file.',
    );
    expect(declaration.description).not.toContain(
      'The user has the ability to modify',
    );
  });

  it('uses the concise shell declaration for local gemma models', () => {
    const declaration = resolveToolDeclaration(
      getShellDefinition(true, true, false),
      'gemma4:31b',
    );

    expect(declaration.description).toContain(
      'Run a shell command in the workspace.',
    );
    expect(declaration.description).toContain(
      'Do not use shell redirection or chmod as a substitute for write_file or replace.',
    );
  });
});
