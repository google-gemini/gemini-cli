/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { main as generateDocs } from '../generate-settings-doc.ts';

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(''),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    on: vi.fn(),
  })),
}));

describe('generate-settings-doc', () => {
  it('keeps documentation in sync in check mode', async () => {
    const previousExitCode = process.exitCode;
    try {
      process.exitCode = 0;
      await expect(generateDocs(['--check'])).resolves.toBeUndefined();
      expect(process.exitCode).toBe(0);
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
