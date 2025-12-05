/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { main as generateSchema } from '../generate-settings-schema.ts';

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(''),
  writeFileSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    on: vi.fn(),
  })),
}));

describe('generate-settings-schema', () => {
  it('keeps schema in sync in check mode', async () => {
    const previousExitCode = process.exitCode;
    await expect(generateSchema(['--check'])).resolves.toBeUndefined();
    expect(process.exitCode).toBe(previousExitCode);
  });

  it('includes $schema property in generated schema', async () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const schemaPath = join(__dirname, '../../schemas/settings.schema.json');
    const schemaContent = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);

    // Verify $schema property exists in the schema's properties
    expect(schema.properties).toHaveProperty('$schema');
    expect(schema.properties.$schema).toEqual({
      type: 'string',
      title: 'Schema',
      description:
        'The URL of the JSON schema for this settings file. Used by editors for validation and autocompletion.',
      default:
        'https://raw.githubusercontent.com/google-gemini/gemini-cli/main/schemas/settings.schema.json',
    });
  });
});
