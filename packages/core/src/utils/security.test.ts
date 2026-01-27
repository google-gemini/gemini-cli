/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isDirectorySecure } from './security.js';
import * as fs from 'node:fs/promises';
import { constants, type Stats } from 'node:fs';
import * as os from 'node:os';
import { spawnAsync } from './shell-utils.js';

vi.mock('node:fs/promises');
vi.mock('node:fs');
vi.mock('node:os');
vi.mock('./shell-utils.js', () => ({
  spawnAsync: vi.fn(),
}));

describe('isDirectorySecure', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns secure=true on Windows if ACL check passes', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({ stdout: '', stderr: '' });

    const result = await isDirectorySecure('C:\\Some\\Path');
    expect(result.secure).toBe(true);
    expect(spawnAsync).toHaveBeenCalledWith(
      'powershell',
      expect.arrayContaining(['-Command', expect.stringContaining('Get-Acl')]),
    );
  });

  it('returns secure=false on Windows if ACL check fails', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'BUILTIN\\Users',
      stderr: '',
    });

    const result = await isDirectorySecure('C:\\Some\\Path');

    expect(result.secure).toBe(false);

    expect(result.reason).toBe(
      "Directory 'C:\\Some\\Path' is insecure. The following user groups have write permissions: BUILTIN\\Users. To fix this, remove Write and Modify permissions for these groups from the directory's ACLs.",
    );
  });

  it('returns secure=false on Windows if spawnAsync fails', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');

    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);

    vi.mocked(spawnAsync).mockRejectedValue(
      new Error('PowerShell is not installed'),
    );

    const result = await isDirectorySecure('C:\\Some\\Path');

    expect(result.secure).toBe(false);

    expect(result.reason).toBe(
      "A security check for the system policy directory 'C:\\Some\\Path' failed and could not be completed. Please file a bug report. Original error: PowerShell is not installed",
    );
  });

  it('returns secure=true if directory does not exist (ENOENT)', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');

    const error = new Error('ENOENT');

    Object.assign(error, { code: 'ENOENT' });

    vi.mocked(fs.stat).mockRejectedValue(error);

    const result = await isDirectorySecure('/some/path');

    expect(result.secure).toBe(true);
  });

  it('returns secure=false if path is not a directory', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');

    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => false,

      uid: 0,

      mode: 0o700,
    } as unknown as Stats);

    const result = await isDirectorySecure('/some/file');

    expect(result.secure).toBe(false);

    expect(result.reason).toBe('Not a directory');
  });

  it('returns secure=false if not owned by root (uid 0) on POSIX', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');

    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,

      uid: 1000, // Non-root

      mode: 0o755,
    } as unknown as Stats);

    const result = await isDirectorySecure('/some/path');

    expect(result.secure).toBe(false);

    expect(result.reason).toBe(
      'Directory \'/some/path\' is not owned by root (uid 0). Current uid: 1000. To fix this, run: sudo chown root:root "/some/path"',
    );
  });

  it('returns secure=false if writable by group (020) on POSIX', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0o020, S_IWOTH: 0 });

    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,

      uid: 0,

      mode: 0o775, // rwxrwxr-x (group writable)
    } as unknown as Stats);

    const result = await isDirectorySecure('/some/path');

    expect(result.secure).toBe(false);

    expect(result.reason).toBe(
      'Directory \'/some/path\' is writable by group or others (mode: 775). To fix this, run: sudo chmod g-w,o-w "/some/path"',
    );
  });

  it('returns secure=false if writable by others (002) on POSIX', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0, S_IWOTH: 0o002 });

    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,

      uid: 0,

      mode: 0o757, // rwxr-xrwx (others writable)
    } as unknown as Stats);

    const result = await isDirectorySecure('/some/path');

    expect(result.secure).toBe(false);

    expect(result.reason).toBe(
      'Directory \'/some/path\' is writable by group or others (mode: 757). To fix this, run: sudo chmod g-w,o-w "/some/path"',
    );
  });

  it('returns secure=true if owned by root and secure permissions on POSIX', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0, S_IWOTH: 0 });

    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,

      uid: 0,

      mode: 0o755, // rwxr-xr-x
    } as unknown as Stats);

    const result = await isDirectorySecure('/some/path');

    expect(result.secure).toBe(true);
  });
});
