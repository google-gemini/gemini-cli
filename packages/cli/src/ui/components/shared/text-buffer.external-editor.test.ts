/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../../test-utils/render.js';
import { useTextBuffer } from './text-buffer.js';
import fs from 'node:fs';
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockWriteFileSync = vi.mocked(fs.writeFileSync);
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockUnlinkSync = vi.mocked(fs.unlinkSync);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockRmdirSync = vi.mocked(fs.rmdirSync);

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup default mock behaviors
    mockMkdtempSync.mockReturnValue('/tmp/gemini-edit-123');
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

  it('should parse editor command with arguments correctly', async () => {
    const { result } = renderHook(() =>
      useTextBuffer({
        initialText: 'initial',
        viewport: { width: 80, height: 24 },
        isValidPath: () => false,
      }),
    );

    await result.current.openInExternalEditor({ editor: 'code -n --wait' });

    const expectedFilePath = path.join('/tmp/gemini-edit-123', 'buffer.txt');

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'code',
      ['-n', '--wait', expectedFilePath],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('should handle editor command without arguments', async () => {
    const { result } = renderHook(() =>
      useTextBuffer({
        initialText: 'initial',
        viewport: { width: 80, height: 24 },
        isValidPath: () => false,
      }),
    );

    await result.current.openInExternalEditor({ editor: 'vim' });

    const expectedFilePath = path.join('/tmp/gemini-edit-123', 'buffer.txt');

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'vim',
      [expectedFilePath],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('should handle quoted arguments in editor command', async () => {
    const { result } = renderHook(() =>
      useTextBuffer({
        initialText: 'initial',
        viewport: { width: 80, height: 24 },
        isValidPath: () => false,
      }),
    );

    await result.current.openInExternalEditor({
      editor: '/path/to/editor --arg "quoted value"',
    });

    const expectedFilePath = path.join('/tmp/gemini-edit-123', 'buffer.txt');

    expect(mockSpawnSync).toHaveBeenCalledWith(
      '/path/to/editor',
      ['--arg', 'quoted value', expectedFilePath],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('should reject editor command with shell operators', async () => {
    const { result } = renderHook(() =>
      useTextBuffer({
        initialText: 'initial',
        viewport: { width: 80, height: 24 },
        isValidPath: () => false,
      }),
    );

    // Shell operators like && are not supported
    await result.current.openInExternalEditor({
      editor: 'code -n && touch /tmp/malicious',
    });

    // spawnSync should NOT be called because the command should be rejected
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('should reject editor command with pipe operators', async () => {
    const { result } = renderHook(() =>
      useTextBuffer({
        initialText: 'initial',
        viewport: { width: 80, height: 24 },
        isValidPath: () => false,
      }),
    );

    // Pipe operators are not supported
    await result.current.openInExternalEditor({
      editor: 'cat | vim -',
    });

    // spawnSync should NOT be called
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});
