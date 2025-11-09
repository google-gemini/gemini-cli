/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { main as generateSchema } from '../generate-settings-schema.ts';

describe('generate-settings-schema', () => {
  it('keeps schema in sync in check mode', async () => {
    const previousExitCode = process.exitCode;
    await expect(generateSchema(['--check'])).resolves.toBeUndefined();
    expect(process.exitCode).toBe(previousExitCode);
  });
});
