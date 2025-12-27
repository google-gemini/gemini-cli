/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ModelConfigService } from './modelConfigService.js';
import { DEFAULT_MODEL_CONFIGS } from '../config/defaultModelConfigs.js';

const GOLDEN_FILE_PATH = path.resolve(
  process.cwd(),
  'src',
  'services',
  'test-data',
  'resolved-aliases.golden.json',
);

const RETRY_GOLDEN_FILE_PATH = path.resolve(
  process.cwd(),
  'src',
  'services',
  'test-data',
  'resolved-aliases-retry.golden.json',
);

describe('ModelConfigService Golden Test', () => {
  it('should match the golden file for resolved default aliases', async () => {
    const service = new ModelConfigService(DEFAULT_MODEL_CONFIGS);
    const aliases = Object.keys(DEFAULT_MODEL_CONFIGS.aliases ?? {});

    const resolvedAliases: Record<string, unknown> = {};
    for (const alias of aliases) {
      resolvedAliases[alias] =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any).internalGetResolvedConfig({ model: alias });
    }

    if (process.env['UPDATE_GOLDENS']) {
      await fs.mkdir(path.dirname(GOLDEN_FILE_PATH), { recursive: true });
      await fs.writeFile(
        GOLDEN_FILE_PATH,
        JSON.stringify(resolvedAliases, null, 2),
        'utf-8',
      );
      // In update mode, we pass the test after writing the file.
      return;
    }

    let goldenContent: string;
    try {
      goldenContent = await fs.readFile(GOLDEN_FILE_PATH, 'utf-8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          'Golden file not found. Run with `UPDATE_GOLDENS=true` to create it.',
        );
      }
      throw e;
    }

    const goldenData = JSON.parse(goldenContent);

    expect(
      resolvedAliases,
      'Golden file mismatch. If the new resolved aliases are correct, run the test with `UPDATE_GOLDENS=true` to regenerate the golden file.',
    ).toEqual(goldenData);
  });

  it('should match the golden file for resolved default aliases with isRetry=true', async () => {
    const service = new ModelConfigService(DEFAULT_MODEL_CONFIGS);
    const aliases = Object.keys(DEFAULT_MODEL_CONFIGS.aliases ?? {});

    const resolvedAliases: Record<string, unknown> = {};
    for (const alias of aliases) {
      resolvedAliases[alias] =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any).internalGetResolvedConfig({
          model: alias,
          isRetry: true,
        });
    }

    if (process.env['UPDATE_GOLDENS']) {
      await fs.mkdir(path.dirname(RETRY_GOLDEN_FILE_PATH), { recursive: true });
      await fs.writeFile(
        RETRY_GOLDEN_FILE_PATH,
        JSON.stringify(resolvedAliases, null, 2),
        'utf-8',
      );
      // In update mode, we pass the test after writing the file.
      return;
    }

    let goldenContent: string;
    try {
      goldenContent = await fs.readFile(RETRY_GOLDEN_FILE_PATH, 'utf-8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          'Golden file not found. Run with `UPDATE_GOLDENS=true` to create it.',
        );
      }
      throw e;
    }

    const goldenData = JSON.parse(goldenContent);

    expect(
      resolvedAliases,
      'Golden file mismatch. If the new resolved aliases are correct, run the test with `UPDATE_GOLDENS=true` to regenerate the golden file.',
    ).toEqual(goldenData);
  });
});
