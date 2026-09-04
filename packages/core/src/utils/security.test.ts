/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDirectorySecure,
  isDirectorySecureSync,
  isPathSecure,
  isPathSecureSync,
  clearSecurityCheckCacheForTesting,
} from './security.js';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { constants, type Stats } from 'node:fs';
import * as os from 'node:os';
import { spawnAsync } from './shell-utils.js';
import { spawnSync } from 'node:child_process';

vi.mock('node:fs/promises');
vi.mock('node:fs');
vi.mock('node:os');
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));
vi.mock('./shell-utils.js', () => ({
  spawnAsync: vi.fn(),
}));

describe('isDirectorySecure', () => {
  beforeEach(() => {
    clearSecurityCheckCacheForTesting();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearSecurityCheckCacheForTesting();
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
      expect.objectContaining({
        env: expect.objectContaining({ GEMINI_TARGET_PATH: 'C:\\Some\\Path' }),
      }),
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

describe('isDirectorySecureSync', () => {
  beforeEach(() => {
    clearSecurityCheckCacheForTesting();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearSecurityCheckCacheForTesting();
  });

  it('returns secure=false if path is not a directory', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      uid: 0,
      mode: 0o755,
    } as unknown as Stats);

    const result = isDirectorySecureSync('/some/file');
    expect(result.secure).toBe(false);
    expect(result.reason).toBe('Not a directory');
  });

  it('returns secure=true if directory is owned by root and secure on POSIX', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0, S_IWOTH: 0 });
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => true,
      uid: 0,
      mode: 0o755,
    } as unknown as Stats);

    const result = isDirectorySecureSync('/etc/gemini-cli');
    expect(result.secure).toBe(true);
  });
});

describe('isPathSecureSync', () => {
  beforeEach(() => {
    clearSecurityCheckCacheForTesting();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearSecurityCheckCacheForTesting();
  });

  it('returns secure=true if file does not exist (ENOENT)', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    const error = new Error('ENOENT');
    Object.assign(error, { code: 'ENOENT' });
    vi.mocked(fsSync.statSync).mockImplementation(() => {
      throw error;
    });

    const result = isPathSecureSync('/non/existent/path.json');
    expect(result.secure).toBe(true);
  });

  it('returns secure=false on Windows if path has untrusted owner', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
    } as unknown as Stats);
    vi.mocked(spawnSync).mockReturnValue({
      stdout: 'InsecureOwner: COMPUTER\\Attacker\n',
      stderr: '',
      status: 0,
      pid: 1,
      output: [],
      signal: null,
    });

    const result = isPathSecureSync(
      'C:\\ProgramData\\gemini-cli\\system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain('Owner is untrusted: COMPUTER\\Attacker');
    expect(spawnSync).toHaveBeenCalledWith(
      'powershell',
      expect.anything(),
      expect.objectContaining({
        env: expect.objectContaining({
          GEMINI_TARGET_PATH:
            'C:\\ProgramData\\gemini-cli\\system-defaults.json',
        }),
      }),
    );
  });

  it('returns secure=false with File prefix on POSIX when file is not owned by root', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      uid: 1000,
      mode: 0o644,
    } as unknown as Stats);

    const result = isPathSecureSync('/etc/gemini-cli/system-defaults.json');
    expect(result.secure).toBe(false);
    expect(result.reason).toBe(
      'File \'/etc/gemini-cli/system-defaults.json\' is not owned by root (uid 0). Current uid: 1000. To fix this, run: sudo chown root:root "/etc/gemini-cli/system-defaults.json"',
    );
  });

  it('returns secure=false on Windows if user groups have write permissions', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
    } as unknown as Stats);
    vi.mocked(spawnSync).mockReturnValue({
      stdout: 'BUILTIN\\Users\n',
      stderr: '',
      status: 0,
      pid: 1,
      output: [],
      signal: null,
    });

    const result = isPathSecureSync(
      'C:\\ProgramData\\gemini-cli\\system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain('BUILTIN\\Users');
  });

  it('validates parent directory for files on POSIX and fails if parent is insecure', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0, S_IWOTH: 0 });

    vi.mocked(fsSync.statSync).mockImplementation((target) => {
      if (target === '/etc/gemini-cli/system-defaults.json') {
        return {
          isDirectory: () => false,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      // Parent directory owned by non-root
      return {
        isDirectory: () => true,
        uid: 1000,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = isPathSecureSync('/etc/gemini-cli/system-defaults.json');
    expect(result.secure).toBe(false);
    expect(result.reason).toContain('not owned by root (uid 0)');
  });

  it('returns secure=true on POSIX if both file and parent directory are secure', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0, S_IWOTH: 0 });

    vi.mocked(fsSync.statSync).mockImplementation((target) => {
      if (target === '/etc/gemini-cli/system-defaults.json') {
        return {
          isDirectory: () => false,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = isPathSecureSync('/etc/gemini-cli/system-defaults.json');
    expect(result.secure).toBe(true);
  });
});

describe('isPathSecure', () => {
  beforeEach(() => {
    clearSecurityCheckCacheForTesting();
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearSecurityCheckCacheForTesting();
  });

  it('returns secure=true if file does not exist (ENOENT)', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    const error = new Error('ENOENT');
    Object.assign(error, { code: 'ENOENT' });
    vi.mocked(fs.stat).mockRejectedValue(error);

    const result = await isPathSecure('/non/existent/path.json');
    expect(result.secure).toBe(true);
  });

  it('returns secure=false on Windows if path has untrusted owner', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => false,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'InsecureOwner: COMPUTER\\Attacker\n',
      stderr: '',
    });

    const result = await isPathSecure(
      'C:\\ProgramData\\gemini-cli\\system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain('Owner is untrusted: COMPUTER\\Attacker');
  });

  it('returns secure=false on POSIX in isPathSecure if parent directory is insecure', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0, S_IWOTH: 0 });

    vi.mocked(fs.stat).mockImplementation(async (target) => {
      if (target === '/etc/gemini-cli/system-defaults.json') {
        return {
          isDirectory: () => false,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        uid: 1000,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = await isPathSecure('/etc/gemini-cli/system-defaults.json');
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      "Directory '/etc/gemini-cli' is not owned by root (uid 0)",
    );
  });

  it('returns secure=true on POSIX if both file and parent directory are secure', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0, S_IWOTH: 0 });

    vi.mocked(fs.stat).mockImplementation(async (target) => {
      if (target === '/etc/gemini-cli/system-defaults.json') {
        return {
          isDirectory: () => false,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = await isPathSecure('/etc/gemini-cli/system-defaults.json');
    expect(result.secure).toBe(true);
  });
});
