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

  function renderTextBuffer(getPreferredEditor?: () => string | undefined) {
    return renderHook(() =>
      useTextBuffer({
        initialText: 'initial',
        viewport: { width: 80, height: 24 },
        isValidPath: () => false,
        getPreferredEditor,
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
    vi.unstubAllEnvs();
  });

  it.each([
    {
      name: 'command without arguments',
      editor: 'vim',
      expectedCmd: 'vim',
      expectedArgs: [expectedFilePath],
    },
    {
      name: 'VISUAL environment variable',
      env: { VISUAL: 'nano' },
      expectedCmd: 'nano',
      expectedArgs: [expectedFilePath],
    },
    {
      name: 'EDITOR environment variable',
      env: { EDITOR: 'emacs' },
      expectedCmd: 'emacs',
      expectedArgs: [expectedFilePath],
    },
    {
      name: 'VISUAL takes precedence over EDITOR',
      env: { VISUAL: 'code', EDITOR: 'vim' },
      expectedCmd: 'code',
      expectedArgs: [expectedFilePath],
    },
  ])(
    'should launch editor for $name with file path',
    async ({ editor, env, expectedCmd, expectedArgs }) => {
      if (env) {
        Object.entries(env).forEach(([key, value]) => {
          vi.stubEnv(key, value);
        });
      }
      const { result } = renderTextBuffer(() => editor);

      await result.current.openInExternalEditor();

      expect(mockSpawnSync).toHaveBeenCalledWith(
        expectedCmd,
        expectedArgs,
        expect.objectContaining({ stdio: 'inherit' }),
      );
    },
  );
});
