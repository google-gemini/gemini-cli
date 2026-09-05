/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isDirectorySecure,
  isPathSecureSync,
  isFileAndDirectorySecureSync,
  clearSecurityCacheForTesting,
  createPathSecurityCache,
  SecurityValidator,
  normalizeSecurityPath,
} from './security.js';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { constants, type Stats } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { spawnAsync } from './shell-utils.js';

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
  const originalS_IWGRP = constants.S_IWGRP;
  const originalS_IWOTH = constants.S_IWOTH;

  afterEach(() => {
    vi.clearAllMocks();
    clearSecurityCacheForTesting();
    Object.assign(constants, {
      S_IWGRP: originalS_IWGRP,
      S_IWOTH: originalS_IWOTH,
    });
  });

  it('returns secure=true on Windows if ACL check passes', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'PATH:C:\\Some\\Path\n',
      stderr: '',
    });

    const result = await isDirectorySecure('C:\\Some\\Path');
    expect(result.secure).toBe(true);
    const spawnCall = vi.mocked(spawnAsync).mock.calls[0];
    const scriptArg = Buffer.from(spawnCall[1]?.[5] ?? '', 'base64').toString(
      'utf16le',
    );
    expect(spawnCall[1]).toContain('-EncodedCommand');
    expect(scriptArg).toContain('Get-Acl');
  });

  it('returns secure=false on Windows if ACL check fails', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'PERMS:BUILTIN\\Users',
      stderr: '',
    });

    const result = await isDirectorySecure('C:\\Some\\Path');

    expect(result.secure).toBe(false);

    expect(result.reason).toBe(
      "Directory 'C:\\Some\\Path' is insecure. The following user groups have write permissions: BUILTIN\\Users. To fix this, remove Write and Modify permissions for these groups from the directory's ACLs.",
    );
  });

  it('ignores unexpected stdout lines or banners that lack OWNER: or PERMS: prefix', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout:
        'Windows PowerShell\nCopyright (C) Microsoft Corporation. All rights reserved.\nPATH:C:\\Some\\Path\n',
      stderr: '',
    });

    const result = await isDirectorySecure('C:\\Some\\Path');
    expect(result.secure).toBe(true);
  });

  it('returns secure=false when PowerShell output is empty or missing PATH marker (fail-secure)', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: '',
      stderr: '',
    });

    const result = await isDirectorySecure('C:\\Some\\Path');
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'Security check output missing or incomplete',
    );
  });

  it('returns secure=false when PowerShell outputs unexpected lines without PATH marker (fail-secure)', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'Windows PowerShell\nSome unexpected banner\n',
      stderr: '',
    });

    const result = await isDirectorySecure('C:\\Some\\Path');
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'Security check output missing or incomplete',
    );
  });

  it('captures ERROR: marker from PowerShell output and returns secure=false', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'ERROR:Access is denied to security descriptor\n',
      stderr: '',
    });

    const result = await isDirectorySecure('C:\\Some\\Path');
    expect(result.secure).toBe(false);
    expect(result.reason).toContain('Access is denied to security descriptor');
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

  it('returns secure=false on Windows if owner is untrusted', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'OWNER:DESKTOP\\Attacker',
      stderr: '',
    });

    const result = await isDirectorySecure('C:\\ProgramData\\gemini-cli');

    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'is not owned by a trusted administrator or SYSTEM account',
    );
  });

  it('uses boundary matching for trusted owners in Windows ACL script', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'PATH:C:\\Some\\Path\n',
      stderr: '',
    });

    await isDirectorySecure('C:\\Some\\Path');

    const spawnCall = vi.mocked(spawnAsync).mock.calls[0];
    const scriptArg = Buffer.from(spawnCall[1]?.[5] ?? '', 'base64').toString(
      'utf16le',
    );
    expect(spawnCall[1]).toContain('-EncodedCommand');
    expect(scriptArg).toContain(
      "($owner -like '*\\Administrators' -or $owner -eq 'Administrators')",
    );
  });

  it('uses boundary matching in Windows ACL fallback catch block', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
    } as unknown as Stats);
    vi.mocked(spawnAsync).mockResolvedValue({
      stdout: 'PATH:C:\\Some\\Path\n',
      stderr: '',
    });

    await isDirectorySecure('C:\\Some\\Path');

    const spawnCall = vi.mocked(spawnAsync).mock.calls[0];
    const scriptArg = Buffer.from(spawnCall[1]?.[5] ?? '', 'base64').toString(
      'utf16le',
    );
    expect(spawnCall[1]).toContain('-EncodedCommand');
    expect(scriptArg).toContain(
      "($id -like '*\\Administrators' -or $id -eq 'Administrators')",
    );
  });

  it('falls back to 0o020 and 0o002 when constants.S_IWGRP and constants.S_IWOTH are undefined', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    // Simulate non-POSIX or mocked environment where constants are undefined
    delete (constants as Record<string, unknown>)['S_IWGRP'];
    delete (constants as Record<string, unknown>)['S_IWOTH'];

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

  it('falls back to C:\\Windows if SystemRoot is invalid or a UNC path', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    const envBackup = {
      SystemRoot: process.env['SystemRoot'],
      systemroot: process.env['systemroot'],
      windir: process.env['windir'],
      WINDIR: process.env['WINDIR'],
    };
    try {
      delete process.env['systemroot'];
      delete process.env['windir'];
      delete process.env['WINDIR'];
      process.env['SystemRoot'] = '\\\\attacker\\share';
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as unknown as Stats);
      vi.mocked(spawnAsync).mockResolvedValue({
        stdout: 'PATH:C:\\Some\\Path\n',
        stderr: '',
      });

      await isDirectorySecure('C:\\Some\\Path');
      expect(vi.mocked(spawnAsync).mock.calls[0]?.[0]).toBe(
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      );
    } finally {
      for (const [key, val] of Object.entries(envBackup)) {
        if (val !== undefined) {
          process.env[key] = val;
        } else {
          delete process.env[key];
        }
      }
    }
  });

  it('uses valid drive letter systemRoot if provided', async () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    const envBackup = {
      SystemRoot: process.env['SystemRoot'],
      systemroot: process.env['systemroot'],
      windir: process.env['windir'],
      WINDIR: process.env['WINDIR'],
    };
    try {
      delete process.env['systemroot'];
      delete process.env['windir'];
      delete process.env['WINDIR'];
      process.env['SystemRoot'] = 'D:\\CustomWindows';
      vi.mocked(fs.stat).mockResolvedValue({
        isDirectory: () => true,
      } as unknown as Stats);
      vi.mocked(spawnAsync).mockResolvedValue({
        stdout: 'PATH:C:\\Some\\Path\n',
        stderr: '',
      });

      await isDirectorySecure('C:\\Some\\Path');
      expect(vi.mocked(spawnAsync).mock.calls[0]?.[0]).toBe(
        'D:\\CustomWindows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      );
    } finally {
      for (const [key, val] of Object.entries(envBackup)) {
        if (val !== undefined) {
          process.env[key] = val;
        } else {
          delete process.env[key];
        }
      }
    }
  });
});

describe('isPathSecureSync', () => {
  const originalS_IWGRP = constants.S_IWGRP;
  const originalS_IWOTH = constants.S_IWOTH;

  afterEach(() => {
    vi.clearAllMocks();
    clearSecurityCacheForTesting();
    Object.assign(constants, {
      S_IWGRP: originalS_IWGRP,
      S_IWOTH: originalS_IWOTH,
    });
  });

  it('returns secure=true if path does not exist (ENOENT)', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    const error = new Error('ENOENT');
    Object.assign(error, { code: 'ENOENT' });
    vi.mocked(fsSync.statSync).mockImplementation(() => {
      throw error;
    });

    const result = isPathSecureSync('/non/existent');
    expect(result.secure).toBe(true);
  });

  it('returns secure=false if expectedType is file but path is directory', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => true,
      isFile: () => false,
      uid: 0,
      mode: 0o755,
    } as unknown as Stats);

    const result = isPathSecureSync('/some/dir', 'file');
    expect(result.secure).toBe(false);
    expect(result.reason).toBe('Not a file');
  });

  it('correctly handles different expectedType constraints across multiple calls to the same path', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0o020, S_IWOTH: 0o002 });
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => true,
      isFile: () => false,
      uid: 0,
      mode: 0o755,
    } as unknown as Stats);
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);

    // First call: check as directory (passes)
    const dirResult = isPathSecureSync('/etc/gemini-cli', 'directory');
    expect(dirResult.secure).toBe(true);

    // Second call: check same path as file (must fail, should not return cached dir result)
    const fileResult = isPathSecureSync('/etc/gemini-cli', 'file');
    expect(fileResult.secure).toBe(false);
    expect(fileResult.reason).toBe('Not a file');
  });

  it('returns secure=true on Windows when owner and ACL checks pass', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    } as unknown as Stats);
    const testPath = 'C:\\ProgramData\\gemini-cli\\settings.json';
    const normalized = path.win32.resolve(testPath);
    vi.mocked(spawnSync).mockReturnValue({
      stdout: `PATH:${normalized}\n`,
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = isPathSecureSync(testPath, 'file');
    expect(result.secure).toBe(true);
    expect(spawnSync).toHaveBeenCalled();
  });

  it('returns secure=false on Windows when stdout is empty (fail-secure)', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    } as unknown as Stats);
    vi.mocked(spawnSync).mockReturnValue({
      stdout: '',
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = isPathSecureSync(
      'C:\\ProgramData\\gemini-cli\\settings.json',
      'file',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'Security check output missing or incomplete',
    );
  });

  it('returns secure=false on Windows when owner is untrusted', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    } as unknown as Stats);
    vi.mocked(spawnSync).mockReturnValue({
      stdout: 'OWNER:COMPUTER\\Attacker\n',
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = isPathSecureSync(
      'C:\\ProgramData\\gemini-cli\\system-defaults.json',
      'file',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'is not owned by a trusted administrator or SYSTEM account',
    );
  });

  it('returns secure=false on Windows when standard users have write permissions', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    } as unknown as Stats);
    vi.mocked(spawnSync).mockReturnValue({
      stdout: 'PERMS:BUILTIN\\Users\n',
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = isPathSecureSync(
      'C:\\ProgramData\\gemini-cli\\system-defaults.json',
      'file',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'The following user groups have write permissions: BUILTIN\\Users',
    );
  });

  it('returns secure=false on Windows when PowerShell exits with non-zero status', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    } as unknown as Stats);
    vi.mocked(spawnSync).mockReturnValue({
      stdout: '',
      stderr: 'Access is denied.',
      status: 1,
      pid: 1234,
      output: [],
      signal: null,
    });

    const result = isPathSecureSync(
      'C:\\ProgramData\\gemini-cli\\system-defaults.json',
      'file',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'PowerShell execution failed with status 1',
    );
  });

  it('returns secure=false on Windows when PowerShell times out', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
    } as unknown as Stats);
    const timeoutErr = new Error('ETIMEDOUT') as NodeJS.ErrnoException;
    timeoutErr.code = 'ETIMEDOUT';
    vi.mocked(spawnSync).mockReturnValue({
      stdout: '',
      stderr: '',
      status: null,
      pid: 1234,
      output: [],
      signal: 'SIGTERM',
      error: timeoutErr,
    });

    const result = isPathSecureSync(
      'C:\\ProgramData\\gemini-cli\\system-defaults.json',
      'file',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'Security validation timed out after 5000ms',
    );
  });

  it('returns secure=false on POSIX when not owned by root', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      uid: 1000,
      mode: 0o644,
    } as unknown as Stats);
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);

    const result = isPathSecureSync(
      '/etc/gemini-cli/system-defaults.json',
      'file',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain('is not owned by root (uid 0)');
  });

  it('returns secure=false on POSIX when writable by others', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0, S_IWOTH: 0o002 });
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      uid: 0,
      mode: 0o666,
    } as unknown as Stats);
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);

    const result = isPathSecureSync(
      '/etc/gemini-cli/system-defaults.json',
      'file',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain('is writable by group or others');
  });

  it('returns secure=true on POSIX when symlink is owned by root (uid 0) even with mode 0777', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0o020, S_IWOTH: 0o002 });
    // Target file: uid 0, mode 0644 (secure)
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      uid: 0,
      mode: 0o644,
    } as unknown as Stats);
    // Symlink: uid 0, mode 0777 (standard POSIX symlink permissions)
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => true,
      uid: 0,
      mode: 0o777,
    } as unknown as Stats);

    const result = isPathSecureSync(
      '/etc/gemini-cli/system-defaults.json',
      'file',
    );
    expect(result.secure).toBe(true);
  });

  it('returns secure=false on POSIX when symlink is not owned by root (uid 1000)', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    // Target file: uid 0, mode 0644
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      uid: 0,
      mode: 0o644,
    } as unknown as Stats);
    // Symlink: uid 1000 (attacker-controlled symlink)
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => true,
      uid: 1000,
      mode: 0o777,
    } as unknown as Stats);

    const result = isPathSecureSync(
      '/etc/gemini-cli/system-defaults.json',
      'file',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      "Symlink '/etc/gemini-cli/system-defaults.json' is not owned by root (uid 0)",
    );
  });
});

describe('isFileAndDirectorySecureSync', () => {
  afterEach(() => {
    vi.clearAllMocks();
    clearSecurityCacheForTesting();
  });

  it('returns secure=true if file does not exist', () => {
    vi.mocked(fsSync.existsSync).mockReturnValue(false);

    const result = isFileAndDirectorySecureSync(
      '/etc/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(true);
  });

  it('returns secure=false if existsSync throws an error', () => {
    vi.mocked(fsSync.existsSync).mockImplementation(() => {
      throw new Error('Permission denied or storage error');
    });

    const result = isFileAndDirectorySecureSync(
      '/etc/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'Failed to verify existence of path: Permission denied or storage error',
    );
  });

  it('returns secure=false if parent directory is insecure', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);
    // Parent dir: uid 1000 (insecure)
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).endsWith('gemini-cli')) {
        return {
          isDirectory: () => true,
          isFile: () => false,
          uid: 1000,
          mode: 0o755,
        } as unknown as Stats;
      }
      if (String(p).endsWith('.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = isFileAndDirectorySecureSync(
      '/etc/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      "Parent directory '/etc/gemini-cli' is insecure",
    );
  });

  it.skip('returns secure=false if ancestor directory of normalized path is insecure', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.realpathSync).mockImplementation((p) => p.toString());
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr === '/etc') {
        return {
          isDirectory: () => true,
          isFile: () => false,
          uid: 1000,
          mode: 0o777,
        } as unknown as Stats;
      }
      if (pathStr.endsWith('.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = isFileAndDirectorySecureSync(
      '/etc/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain("Parent directory '/etc' is insecure");
  });

  it('returns secure=false if file itself is insecure', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    // Parent dirs: secure root; File: insecure uid 1000
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).endsWith('.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
          uid: 1000,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);

    const result = isFileAndDirectorySecureSync(
      '/etc/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain('File is insecure');
  });

  it('returns secure=true when both parent directory and file are secure', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    Object.assign(constants, { S_IWGRP: 0o020, S_IWOTH: 0o002 });
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).endsWith('.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);

    const result = isFileAndDirectorySecureSync(
      '/etc/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(true);
  });

  it('returns secure=false if symlink target parent directory is insecure', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.realpathSync).mockReturnValue(
      '/tmp/evil-dir/system-defaults.json',
    );
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr === '/tmp/evil-dir') {
        return {
          isDirectory: () => true,
          isFile: () => false,
          uid: 1000,
          mode: 0o777,
        } as unknown as Stats;
      }
      if (pathStr.endsWith('.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });
    vi.mocked(fsSync.lstatSync).mockImplementation((p) => {
      if (String(p).endsWith('system-defaults.json')) {
        return {
          isSymbolicLink: () => true,
          uid: 0,
          mode: 0o777,
        } as unknown as Stats;
      }
      return {
        isSymbolicLink: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = isFileAndDirectorySecureSync(
      '/etc/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      "Resolved target parent directory '/tmp/evil-dir' is insecure",
    );
  });

  it.skip('returns secure=false if ancestor directory of canonical target is insecure', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.realpathSync).mockReturnValue(
      '/home/untrusted/configs/system-defaults.json',
    );
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr === '/home/untrusted') {
        return {
          isDirectory: () => true,
          isFile: () => false,
          uid: 1000,
          mode: 0o777,
        } as unknown as Stats;
      }
      if (pathStr.endsWith('.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });
    vi.mocked(fsSync.lstatSync).mockImplementation((p) => {
      if (String(p).endsWith('system-defaults.json')) {
        return {
          isSymbolicLink: () => true,
          uid: 0,
          mode: 0o777,
        } as unknown as Stats;
      }
      return {
        isSymbolicLink: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = isFileAndDirectorySecureSync(
      '/etc/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      "Resolved target parent directory '/home/untrusted' is insecure",
    );
  });

  it('returns secure=false if symlink target file itself is insecure', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.realpathSync).mockReturnValue(
      '/var/safe-dir/insecure-target.json',
    );
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr === '/var/safe-dir/insecure-target.json') {
        return {
          isDirectory: () => false,
          isFile: () => true,
          uid: 1000,
          mode: 0o644,
        } as unknown as Stats;
      }
      if (pathStr.endsWith('.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
          uid: 0,
          mode: 0o644,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });
    vi.mocked(fsSync.lstatSync).mockImplementation((p) => {
      if (String(p).endsWith('system-defaults.json')) {
        return {
          isSymbolicLink: () => true,
          uid: 0,
          mode: 0o777,
        } as unknown as Stats;
      }
      return {
        isSymbolicLink: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = isFileAndDirectorySecureSync(
      '/etc/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain('Resolved target file is insecure');
  });

  it.skip('returns secure=false if grandparent directory is an insecure symlink', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.realpathSync).mockImplementation((p) => p.toString());
    vi.mocked(fsSync.lstatSync).mockImplementation((p) => {
      const pathStr = String(p);
      if (pathStr === '/etc/symlink-dir') {
        return {
          isSymbolicLink: () => true,
          isDirectory: () => false,
          isFile: () => false,
          uid: 1000,
          mode: 0o777,
        } as unknown as Stats;
      }
      return {
        isSymbolicLink: () => false,
        isDirectory: () => true,
        isFile: () => false,
        uid: 0,
        mode: 0o755,
      } as unknown as Stats;
    });

    const result = isFileAndDirectorySecureSync(
      '/etc/symlink-dir/gemini-cli/system-defaults.json',
    );
    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      "Parent directory symlink '/etc/symlink-dir' is insecure",
    );
  });

  it('batches Windows ACL checks for parent directory and file into a single PowerShell call', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.realpathSync).mockImplementation((p) => p.toString());
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).endsWith('settings.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
      } as unknown as Stats;
    });

    const testFilePath = 'C:\\ProgramData\\gemini-cli\\settings.json';
    const normalizedFile = path.win32.resolve(testFilePath);
    const parentDir = path.win32.dirname(normalizedFile);
    const grandparentDir = path.win32.dirname(parentDir);

    vi.mocked(spawnSync).mockReturnValue({
      stdout: `PATH:${parentDir}\nPATH:${grandparentDir}\nPATH:${normalizedFile}\n`,
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const cache = createPathSecurityCache();
    const result = isFileAndDirectorySecureSync(testFilePath, cache);

    expect(result.secure).toBe(true);
    // Verified that spawnSync was invoked exactly once for all directories and file
    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(cache.has(parentDir.toLowerCase())).toBe(true);
    expect(cache.has(grandparentDir.toLowerCase())).toBe(true);
    expect(cache.has(normalizedFile.toLowerCase())).toBe(true);
  });

  it('fails secure if a path is missing from batch output', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.realpathSync).mockImplementation((p) => p.toString());
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).endsWith('settings.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
      } as unknown as Stats;
    });

    const testFilePath = 'C:\\ProgramData\\gemini-cli\\settings.json';
    const normalizedFile = path.win32.resolve(testFilePath);
    const parentDir = path.win32.dirname(normalizedFile);

    // Only output PATH for parentDir, omitting normalizedFile from output
    vi.mocked(spawnSync).mockReturnValue({
      stdout: `PATH:${parentDir}\n`,
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const cache = createPathSecurityCache();
    const result = isFileAndDirectorySecureSync(testFilePath, cache);

    expect(result.secure).toBe(false);
    expect(result.reason).toContain(
      'Security check output missing or incomplete',
    );
  });

  it('handles Windows drive letter casing differences case-insensitively and does not perform redundant checks', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    // Real path has lowercase 'c:' drive letter
    vi.mocked(fsSync.realpathSync).mockImplementation((p) => {
      const pStr = p.toString();
      if (pStr.startsWith('C:\\')) {
        return 'c:\\' + pStr.slice(3);
      }
      return pStr;
    });
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).toLowerCase().endsWith('settings.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
      } as unknown as Stats;
    });

    const testFilePath = 'C:\\ProgramData\\gemini-cli\\settings.json';
    const lowercaseFile = 'c:\\ProgramData\\gemini-cli\\settings.json';
    const normalizedFile = path.win32.resolve(testFilePath);
    const parentDir = path.win32.dirname(normalizedFile);
    const grandparentDir = path.win32.dirname(parentDir);

    // Mock spawnSync to return success for all paths
    vi.mocked(spawnSync).mockReturnValue({
      stdout: `PATH:${parentDir}\nPATH:${grandparentDir}\nPATH:${normalizedFile}\nPATH:${lowercaseFile}\n`,
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const cache = createPathSecurityCache();
    const result = isFileAndDirectorySecureSync(testFilePath, cache);

    expect(result.secure).toBe(true);
    // Verified that spawnSync was invoked exactly once because the canonical path and normalized path were compared case-insensitively
    expect(spawnSync).toHaveBeenCalledTimes(1);
    // The PowerShell script should only check unique, non-redundant paths
    const spawnCall = vi.mocked(spawnSync).mock.calls[0];
    const scriptArg = Buffer.from(
      (spawnCall[1] as string[])?.[5] ?? '',
      'base64',
    ).toString('utf16le');
    expect(scriptArg).toContain(`'${normalizedFile.toLowerCase()}'`);
    expect(scriptArg).toContain(`'${parentDir.toLowerCase()}'`);
    expect(scriptArg).toContain(`'${grandparentDir.toLowerCase()}'`);
    // Should NOT contain duplicate real path with lowercase drive letter as pathsEqual should prevent batching it
    expect(scriptArg).not.toContain(`'${lowercaseFile}'`);
  });

  it('trusts CREATOR OWNER and CREATOR GROUP on Windows', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.realpathSync).mockImplementation((p) => p.toString());
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).endsWith('settings.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
      } as unknown as Stats;
    });

    const testFilePath = 'C:\\ProgramData\\gemini-cli\\settings.json';
    const normalizedFile = path.win32.resolve(testFilePath);
    const parentDir = path.win32.dirname(normalizedFile);
    const grandparentDir = path.win32.dirname(parentDir);

    // Mock spawnSync to return no violations for paths owned/writable by CREATOR OWNER/GROUP
    vi.mocked(spawnSync).mockReturnValue({
      stdout: `PATH:${parentDir}\nPATH:${grandparentDir}\nPATH:${normalizedFile}\n`,
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const cache = createPathSecurityCache();
    const result = isFileAndDirectorySecureSync(testFilePath, cache);

    expect(result.secure).toBe(true);

    // Verify the PowerShell command was invoked and contains CREATOR OWNER and CREATOR GROUP checks
    const spawnCall = vi.mocked(spawnSync).mock.calls[0];
    const scriptArg = Buffer.from(
      (spawnCall[1] as string[])?.[5] ?? '',
      'base64',
    ).toString('utf16le');
    expect(scriptArg).toContain('CREATOR OWNER');
    expect(scriptArg).toContain('CREATOR GROUP');
    expect(scriptArg).toContain('S-1-3-0');
    expect(scriptArg).toContain('S-1-3-1');
    expect(scriptArg).toContain('$rule = $_;');
    expect(scriptArg).toContain('$rule.IdentityReference.Value');
  });

  it('strips Windows extended path prefix \\\\?\\ when resolving paths and canonicalising', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    // Realpath returns \\?\C:\ProgramData\gemini-cli\settings.json
    vi.mocked(fsSync.realpathSync).mockReturnValue(
      '\\\\?\\C:\\ProgramData\\gemini-cli\\settings.json',
    );
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).toLowerCase().endsWith('settings.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
      } as unknown as Stats;
    });

    const testFilePath = 'C:\\ProgramData\\gemini-cli\\settings.json';
    const normalizedFile = path.win32.resolve(testFilePath).toLowerCase();
    const parentDir = path.win32.dirname(normalizedFile);
    const grandparentDir = path.win32.dirname(parentDir);

    // Mock spawnSync to return success for stripped paths
    vi.mocked(spawnSync).mockReturnValue({
      stdout: `PATH:${parentDir}\nPATH:${grandparentDir}\nPATH:${normalizedFile}\n`,
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const cache = createPathSecurityCache();
    const result = isFileAndDirectorySecureSync(testFilePath, cache);

    expect(result.secure).toBe(true);

    // Verify cache has the stripped and normalised lowercased paths (without \\?\)
    expect(cache.has(normalizedFile)).toBe(true);
    expect(cache.has(parentDir)).toBe(true);
    expect(cache.has(grandparentDir)).toBe(true);
    expect(cache.has('\\\\?\\' + normalizedFile)).toBe(false);

    // Verify spawnSync was called and received the stripped paths
    const spawnCall = vi.mocked(spawnSync).mock.calls[0];
    const scriptArg = Buffer.from(
      (spawnCall[1] as string[])?.[5] ?? '',
      'base64',
    ).toString('utf16le');
    expect(scriptArg).toContain(`'${normalizedFile}'`);
    expect(scriptArg).not.toContain('\\\\?\\');
  });

  it('validates Windows ancestor directories up to drive root while excluding drive root', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    vi.mocked(fsSync.realpathSync).mockImplementation((p) => p.toString());
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).endsWith('settings.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
      } as unknown as Stats;
    });

    const testFilePath = 'C:\\ProgramData\\gemini-cli\\settings.json';
    const normalizedFile = path.win32.resolve(testFilePath);
    const parentDir = path.win32.dirname(normalizedFile);
    const grandparentDir = path.win32.dirname(parentDir);

    vi.mocked(spawnSync).mockReturnValue({
      stdout: `PATH:${parentDir}\nPATH:${grandparentDir}\nPATH:${normalizedFile}\n`,
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const cache = createPathSecurityCache();
    const result = isFileAndDirectorySecureSync(testFilePath, cache);

    expect(result.secure).toBe(true);
    const spawnCall = vi.mocked(spawnSync).mock.calls[0];
    const scriptArg = Buffer.from(
      (spawnCall[1] as string[])?.[5] ?? '',
      'base64',
    ).toString('utf16le');
    // Ancestors C:\ProgramData\gemini-cli and C:\ProgramData must be included
    expect(scriptArg).toContain(`'${parentDir.toLowerCase()}'`);
    expect(scriptArg).toContain(`'${grandparentDir.toLowerCase()}'`);
    // Drive root C:\ must be excluded
    expect(scriptArg).not.toContain("'c:\\'");
    expect(cache.has('c:\\')).toBe(false);
  });

  it('strips Windows extended UNC path prefix \\\\?\\UNC\\ and converts to standard UNC path', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    vi.mocked(fsSync.existsSync).mockReturnValue(true);
    // Realpath returns \\?\UNC\server\share\gemini-cli\settings.json
    vi.mocked(fsSync.realpathSync).mockReturnValue(
      '\\\\?\\UNC\\server\\share\\gemini-cli\\settings.json',
    );
    vi.mocked(fsSync.lstatSync).mockReturnValue({
      isSymbolicLink: () => false,
    } as unknown as Stats);
    vi.mocked(fsSync.statSync).mockImplementation((p) => {
      if (String(p).toLowerCase().endsWith('settings.json')) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as Stats;
      }
      return {
        isDirectory: () => true,
        isFile: () => false,
      } as unknown as Stats;
    });

    const testFilePath = '\\\\server\\share\\gemini-cli\\settings.json';
    const normalizedFile =
      '\\\\server\\share\\gemini-cli\\settings.json'.toLowerCase();
    const parentDir = '\\\\server\\share\\gemini-cli'.toLowerCase();

    // Mock spawnSync to return success for stripped paths
    vi.mocked(spawnSync).mockReturnValue({
      stdout: `PATH:${parentDir}\nPATH:${normalizedFile}\n`,
      stderr: '',
      status: 0,
      pid: 1234,
      output: [],
      signal: null,
    });

    const cache = createPathSecurityCache();
    const result = isFileAndDirectorySecureSync(testFilePath, cache);

    expect(result.secure).toBe(true);

    // Verify cache has the stripped and normalised lowercased paths (without \\?\UNC\ or UNC\)
    expect(cache.has(normalizedFile)).toBe(true);
    expect(cache.has(parentDir)).toBe(true);
    expect(cache.has('unc\\server\\share\\gemini-cli\\settings.json')).toBe(
      false,
    );

    // Verify spawnSync was called and received the standard UNC paths
    const spawnCall = vi.mocked(spawnSync).mock.calls[0];
    const scriptArg = Buffer.from(
      (spawnCall[1] as string[])?.[5] ?? '',
      'base64',
    ).toString('utf16le');
    expect(scriptArg).toContain(`'${normalizedFile}'`);
    expect(scriptArg).not.toContain('\\\\?\\');
    expect(scriptArg).not.toContain("'unc\\");
  });
});

describe('normalizeSecurityPath', () => {
  it('strips \\\\?\\ prefix on Windows and converts to lowercase', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    const result = normalizeSecurityPath('\\\\?\\C:\\ProgramData\\gemini-cli');
    expect(result).toBe('c:\\programdata\\gemini-cli');
  });

  it('strips \\\\?\\UNC\\ prefix on Windows and converts to standard UNC path', () => {
    vi.spyOn(os, 'platform').mockReturnValue('win32');
    const result = normalizeSecurityPath(
      '\\\\?\\UNC\\server\\share\\config.json',
    );
    expect(result).toBe('\\\\server\\share\\config.json');
  });

  it('preserves POSIX paths on Linux', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    const result = normalizeSecurityPath('/etc/gemini-cli/settings.json');
    expect(result).toBe('/etc/gemini-cli/settings.json');
  });
});

describe('SecurityValidator', () => {
  it('provides instance-isolated cache across calls', () => {
    vi.spyOn(os, 'platform').mockReturnValue('linux');
    vi.mocked(fsSync.statSync).mockReturnValue({
      isDirectory: () => false,
      isFile: () => true,
      uid: 0,
      mode: 0o644,
    } as unknown as Stats);

    const validator1 = new SecurityValidator();
    const validator2 = new SecurityValidator();

    validator1.isPathSecureSync('/etc/test.conf', 'file');
    expect(validator1.getCache().has('/etc/test.conf')).toBe(true);
    expect(validator2.getCache().has('/etc/test.conf')).toBe(false);

    validator1.clearCache();
    expect(validator1.getCache().has('/etc/test.conf')).toBe(false);
  });
});
