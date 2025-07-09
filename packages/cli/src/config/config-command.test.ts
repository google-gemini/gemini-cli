/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, test, vi } from 'vitest';
import { get, set } from './config-command';
import { promises as fsp } from 'fs';
import path from 'path';

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

test('get should read and log a value from settings', async () => {
  const consoleLogSpy = vi.spyOn(console, 'log');
  vi.mocked(fsp.readFile).mockResolvedValue(
    JSON.stringify({ theme: 'dark' }),
  );
  await get('theme');
  expect(consoleLogSpy).toHaveBeenCalledWith('dark');
});

test('set should write a value to settings', async () => {
  vi.mocked(fsp.readFile).mockResolvedValue(JSON.stringify({}));
  await set('theme', 'light');
  expect(fsp.writeFile).toHaveBeenCalledWith(
    path.join(process.cwd(), '.gemini', 'settings.json'),
    JSON.stringify({ theme: 'light' }, null, 2),
    'utf-8',
  );
});
