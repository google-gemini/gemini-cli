/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { main as generateDocs } from '../generate-settings-doc.ts';

describe('generate-settings-doc', () => {
  it('keeps documentation in sync in check mode', async () => {
    const previousExitCode = process.exitCode;
    await expect(generateDocs(['--check'])).resolves.toBeUndefined();
    expect(process.exitCode).toBe(previousExitCode);
  });
});
