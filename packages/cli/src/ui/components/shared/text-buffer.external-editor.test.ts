/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../../test-utils/render.js';
import { useTextBuffer } from './text-buffer.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Mock dependencies
vi.mock('node:fs');
vi.mock('node:child_process');
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    tmpdir: vi.fn(() => '/tmp'),
    homedir: vi.fn(() => '/mock-home'),
  };
});

describe('useTextBuffer - openInExternalEditor', () => {
  const mockSpawnSync = vi.mocked(spawnSync);
  const mockMkdtempSync = vi.mocked(fs.mkdtempSync);
  const mockReadFileSync = vi.mocked(fs.readFileSync);

  function renderTextBuffer() {
    return renderHook(() =>
      useTextBuffer({
        initialText: 'initial',
        viewport: { width: 80, height: 24 },
        isValidPath: () => false,
      }),
    );
  }

  const expectedTmpDir = path.join(os.tmpdir(), 'gemini-edit-123');
  const expectedFilePath = path.join(expectedTmpDir, 'buffer.txt');

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup default mock behaviors
    mockMkdtempSync.mockReturnValue(expectedTmpDir);
    mockReadFileSync.mockReturnValue('edited content');
    mockSpawnSync.mockReturnValue({
      pid: 123,
      output: [],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      status: 0,
      signal: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      name: 'command with arguments',
      editor: 'code -n --wait',
      expectedCmd: 'code',
      expectedArgs: ['-n', '--wait', expectedFilePath],
    },
    {
      name: 'command without arguments',
      editor: 'vim',
      expectedCmd: 'vim',
      expectedArgs: [expectedFilePath],
    },
    {
      name: 'quoted arguments',
      editor: '/path/to/editor --arg "quoted value"',
      expectedCmd: '/path/to/editor',
      expectedArgs: ['--arg', 'quoted value', expectedFilePath],
    },
  ])(
    'should parse editor $name correctly',
    async ({ editor, expectedCmd, expectedArgs }) => {
      const { result } = renderTextBuffer();

      await result.current.openInExternalEditor({ editor });

      expect(mockSpawnSync).toHaveBeenCalledWith(
        expectedCmd,
        expectedArgs,
        expect.objectContaining({ stdio: 'inherit' }),
      );
    },
  );

  it.each([
    { name: 'shell operators (&&)', editor: 'code -n && touch /tmp/malicious' },
    { name: 'pipe operators', editor: 'cat | vim -' },
  ])('should reject editor command with $name', async ({ editor }) => {
    const { result } = renderTextBuffer();

    await result.current.openInExternalEditor({ editor });

    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});
