/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readLastLines } from './logs.js';

describe('readLastLines', () => {
  const tempFiles: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempFiles
        .splice(0)
        .map((filePath) => fs.promises.rm(filePath, { force: true })),
    );
  });

  it('returns only the requested tail lines without reading the whole file eagerly', async () => {
    const filePath = path.join(
      os.tmpdir(),
      `gemma-logs-${Date.now()}-${Math.random().toString(36).slice(2)}.log`,
    );
    tempFiles.push(filePath);

    const content = Array.from({ length: 2000 }, (_, i) => `line-${i + 1}`)
      .join('\n')
      .concat('\n');
    await fs.promises.writeFile(filePath, content, 'utf-8');

    await expect(readLastLines(filePath, 3)).resolves.toBe(
      'line-1998\nline-1999\nline-2000\n',
    );
  });

  it('returns an empty string when zero lines are requested', async () => {
    const filePath = path.join(
      os.tmpdir(),
      `gemma-logs-${Date.now()}-${Math.random().toString(36).slice(2)}.log`,
    );
    tempFiles.push(filePath);
    await fs.promises.writeFile(filePath, 'line-1\nline-2\n', 'utf-8');

    await expect(readLastLines(filePath, 0)).resolves.toBe('');
  });
});
