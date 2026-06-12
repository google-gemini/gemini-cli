/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'node:os';
import { Storage } from './storage.js';
import * as paths from '../utils/paths.js';

vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
    homedir: vi.fn(actual.homedir),
    resolveToRealPath: vi.fn(actual.resolveToRealPath),
  };
});

describe('Storage.isWorkspaceHomeDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paths.homedir).mockImplementation(os.homedir);
    vi.mocked(paths.resolveToRealPath).mockImplementation((p) => p);
  });

  it('returns true when targetDir is the same as homedir', () => {
    const home = '/Users/test';
    vi.mocked(paths.homedir).mockReturnValue(home);
    const storage = new Storage(home);

    expect(storage.isWorkspaceHomeDir()).toBe(true);
  });

  it('returns true when paths differ only by casing on case-insensitive platforms', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const home = '/Users/Test';
    const target = '/users/test';
    vi.mocked(paths.homedir).mockReturnValue(home);
    const storage = new Storage(target);

    expect(storage.isWorkspaceHomeDir()).toBe(true);
  });

  it('returns true when paths differ by slashes (simulating win32)', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const home = 'C:\\\\Users\\\\Test';
    const target = 'C:/Users/Test';
    vi.mocked(paths.homedir).mockReturnValue(home);
    const storage = new Storage(target);

    expect(storage.isWorkspaceHomeDir()).toBe(true);
  });

  it('returns true when one path has the \\\\?\\ prefix on Windows', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const home = '\\\\?\\C:\\\\Users\\\\Test';
    const target = 'C:\\\\Users\\\\Test';

    vi.mocked(paths.homedir).mockReturnValue(home);
    const storage = new Storage(target);
    expect(storage.isWorkspaceHomeDir()).toBe(true);
  });

  it('returns false when targetDir is a subdirectory of homedir', () => {
    const home = '/Users/test';
    const target = '/Users/test/projects/my-project';
    vi.mocked(paths.homedir).mockReturnValue(home);
    const storage = new Storage(target);

    expect(storage.isWorkspaceHomeDir()).toBe(false);
  });

  it('returns true if paths are technically the same but formatted differently (repro attempt)', () => {
    // Simulate Windows short names if we can
    const home = 'C:\\Users\\HENRIQ~1';
    const target = 'C:\\Users\\Henrique';

    vi.mocked(paths.homedir).mockReturnValue(home);

    // In reality, resolveToRealPath(home) and resolveToRealPath(target)
    // should both return C:\Users\Henrique
    vi.mocked(paths.resolveToRealPath).mockImplementation((p) => {
      if (p === home || p === target) return 'C:\\Users\\Henrique';
      return p;
    });

    const storage = new Storage(target);
    expect(storage.isWorkspaceHomeDir()).toBe(true);
  });
});
