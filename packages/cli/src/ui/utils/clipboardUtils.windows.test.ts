/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { saveClipboardImage } from './clipboardUtils.js';
import { spawnAsync } from '@google/gemini-cli-core';

// Mock dependencies
vi.mock('node:fs/promises');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    spawnAsync: vi.fn(),
  };
});

describe('saveClipboardImage Windows Path Escaping', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('process', { ...process, platform: 'win32' });

    // Mock fs calls to succeed
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.readdir).mockResolvedValue([]);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.unlink).mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('should escape single quotes in path for PowerShell script', async () => {
    vi.mocked(spawnAsync)
      .mockResolvedValueOnce({
        stdout: 'true',
        stderr: '',
      })
      .mockResolvedValueOnce({
        stdout: 'dummyhash',
        stderr: '',
      })
      .mockResolvedValueOnce({
        stdout: 'success',
        stderr: '',
      });

    const targetDir = "User's Files";
    await saveClipboardImage(targetDir);

    expect(spawnAsync).toHaveBeenCalled();
    const args = vi.mocked(spawnAsync).mock.calls[2][1];
    const script = args[1];

    // The path User's Files\.gemini-clipboard\clipboard-....png
    // should be escaped in the script as 'User''s Files\...'

    // Check if the script contains the escaped path
    expect(script).toMatch(/'User''s Files/);
  });
});
