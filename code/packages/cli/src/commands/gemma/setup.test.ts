/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PLATFORM_BINARY_MAP, PLATFORM_BINARY_SHA256 } from './constants.js';
import { computeFileSha256, verifyFileSha256 } from './setup.js';

describe('gemma setup checksum helpers', () => {
  const tempFiles: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempFiles
        .splice(0)
        .map((filePath) => fs.promises.rm(filePath, { force: true })),
    );
  });

  it('has a pinned checksum for every supported LiteRT binary', () => {
    expect(Object.keys(PLATFORM_BINARY_SHA256).sort()).toEqual(
      Object.values(PLATFORM_BINARY_MAP).sort(),
    );
  });

  it('computes the sha256 for a downloaded file', async () => {
    const filePath = path.join(
      os.tmpdir(),
      `gemma-setup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    tempFiles.push(filePath);
    await fs.promises.writeFile(filePath, 'hello world', 'utf-8');

    await expect(computeFileSha256(filePath)).resolves.toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('verifies whether a file matches the expected sha256', async () => {
    const filePath = path.join(
      os.tmpdir(),
      `gemma-setup-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    tempFiles.push(filePath);
    await fs.promises.writeFile(filePath, 'hello world', 'utf-8');

    await expect(
      verifyFileSha256(
        filePath,
        'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
      ),
    ).resolves.toBe(true);
    await expect(verifyFileSha256(filePath, 'deadbeef')).resolves.toBe(false);
  });
});
