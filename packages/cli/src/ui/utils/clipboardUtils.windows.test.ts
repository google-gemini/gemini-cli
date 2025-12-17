/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { saveClipboardImage } from './clipboardUtils.js';

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
    Object.defineProperty(process, 'platform', {
      value: 'win32',
    });

    // Mock fs calls to succeed
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('should escape single quotes in path for PowerShell script', async () => {
    const { spawnAsync } = await import('@google/gemini-cli-core');
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'success',
      stderr: '',
    } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    const targetDir = "C:\\User's Files";
    await saveClipboardImage(targetDir);

    expect(spawnAsync).toHaveBeenCalled();
    const args = vi.mocked(spawnAsync).mock.calls[0][1];
    const script = args[2];

    // The path C:\User's Files\.gemini-clipboard\clipboard-....png
    // should be escaped in the script as 'C:\User''s Files\...'

    // Check if the script contains the escaped path
    expect(script).toMatch(/'C:\\User''s Files/);
  });
});
