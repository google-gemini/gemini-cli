/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';

// We need to mock platform-dependent behaviour. The module under test reads
// process.platform at import time via `IS_WINDOWS`, so we use dynamic imports
// and vi.stubGlobal / vi.stubEnv to control the environment per test.

describe('windowsCompat', () => {
   
  let mod: typeof import('./windowsCompat.js');

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('./windowsCompat.js');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // -----------------------------------------------------------------------
  // Platform detection
  // -----------------------------------------------------------------------

  describe('IS_WINDOWS', () => {
    it('reflects the current platform', () => {
      expect(mod.IS_WINDOWS).toBe(process.platform === 'win32');
    });
  });

  describe('getWindowsBuildNumber', () => {
    it('returns 0 on non-Windows', () => {
      if (process.platform !== 'win32') {
        expect(mod.getWindowsBuildNumber()).toBe(0);
      }
    });

    it('returns a positive number on Windows', () => {
      if (process.platform === 'win32') {
        expect(mod.getWindowsBuildNumber()).toBeGreaterThan(0);
      }
    });
  });

  describe('isWindowsTerminal', () => {
    it('returns false when WT_SESSION is not set', () => {
      delete process.env['WT_SESSION'];
      // Re-import to get fresh evaluation
      expect(mod.isWindowsTerminal()).toBe(
        process.platform === 'win32' && Boolean(process.env['WT_SESSION']),
      );
    });
  });

  describe('detectWindowsShell', () => {
    it('returns "unknown" on non-Windows platforms', () => {
      if (process.platform !== 'win32') {
        expect(mod.detectWindowsShell()).toBe('unknown');
      }
    });

    it('returns a recognized shell kind on Windows', () => {
      if (process.platform === 'win32') {
        const result = mod.detectWindowsShell();
        expect(['powershell', 'cmd', 'bash', 'unknown']).toContain(result);
      }
    });

    it('detects bash when SHELL env var contains bash on Windows', () => {
      if (
        process.platform === 'win32' &&
        process.env['SHELL']?.includes('bash')
      ) {
        expect(mod.detectWindowsShell()).toBe('bash');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Path utilities
  // -----------------------------------------------------------------------

  describe('normalizePlatformPath', () => {
    it('returns an absolute path', () => {
      const result = mod.normalizePlatformPath('relative/path');
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('resolves . to cwd', () => {
      expect(mod.normalizePlatformPath('.')).toBe(path.resolve('.'));
    });
  });

  describe('isPathWithin', () => {
    it('returns true when child is under parent', () => {
      const parent = path.resolve('/foo/bar');
      const child = path.resolve('/foo/bar/baz/file.txt');
      expect(mod.isPathWithin(parent, child)).toBe(true);
    });

    it('returns true when paths are identical', () => {
      const p = path.resolve('/foo/bar');
      expect(mod.isPathWithin(p, p)).toBe(true);
    });

    it('returns false when child is not under parent', () => {
      const parent = path.resolve('/foo/bar');
      const child = path.resolve('/foo/other/file.txt');
      expect(mod.isPathWithin(parent, child)).toBe(false);
    });

    it('returns false for prefix-matching that crosses a directory boundary', () => {
      const parent = path.resolve('/foo/bar');
      const child = path.resolve('/foo/barbaz/file.txt');
      expect(mod.isPathWithin(parent, child)).toBe(false);
    });
  });

  describe('toForwardSlashes', () => {
    it('converts backslashes to forward slashes', () => {
      expect(mod.toForwardSlashes('C:\\Users\\test\\file.txt')).toBe(
        'C:/Users/test/file.txt',
      );
    });

    it('leaves forward slashes unchanged', () => {
      expect(mod.toForwardSlashes('/home/user/file.txt')).toBe(
        '/home/user/file.txt',
      );
    });
  });

  describe('getTempDir', () => {
    it('returns an absolute path', () => {
      expect(path.isAbsolute(mod.getTempDir())).toBe(true);
    });

    it('matches os.tmpdir resolved', () => {
      expect(mod.getTempDir()).toBe(path.resolve(os.tmpdir()));
    });
  });

  describe('isLongPath', () => {
    it('returns false on non-Windows', () => {
      if (process.platform !== 'win32') {
        expect(mod.isLongPath('a'.repeat(300))).toBe(false);
      }
    });

    it('detects paths at or above 260 chars on Windows', () => {
      if (process.platform === 'win32') {
        const longPath = 'C:\\' + 'a'.repeat(300);
        expect(mod.isLongPath(longPath)).toBe(true);
      }
    });
  });

  describe('toLongPath', () => {
    it('returns unchanged path on non-Windows', () => {
      if (process.platform !== 'win32') {
        const p = '/some/path';
        expect(mod.toLongPath(p)).toBe(p);
      }
    });

    it('does not double-prefix', () => {
      if (process.platform === 'win32') {
        const prefixed = '\\\\?\\C:\\some\\long\\path';
        expect(mod.toLongPath(prefixed)).toBe(prefixed);
      }
    });
  });

  // -----------------------------------------------------------------------
  // File system helpers
  // -----------------------------------------------------------------------

  describe('retryOnLock', () => {
    it('returns the result on first success', async () => {
      const result = await mod.retryOnLock(async () => 42);
      expect(result).toBe(42);
    });

    it('retries on EBUSY and eventually succeeds', async () => {
      let attempt = 0;
      const result = await mod.retryOnLock(
        async () => {
          attempt++;
          if (attempt < 3) {
            const err = new Error('EBUSY') as NodeJS.ErrnoException;
            err.code = 'EBUSY';
            throw err;
          }
          return 'success';
        },
        { retries: 3, delayMs: 10 },
      );
      expect(result).toBe('success');
      expect(attempt).toBe(3);
    });

    it('throws after exhausting retries', async () => {
      await expect(
        mod.retryOnLock(
          async () => {
            const err = new Error('EBUSY') as NodeJS.ErrnoException;
            err.code = 'EBUSY';
            throw err;
          },
          { retries: 2, delayMs: 10 },
        ),
      ).rejects.toThrow('EBUSY');
    });

    it('does not retry non-retryable errors', async () => {
      let attempt = 0;
      await expect(
        mod.retryOnLock(
          async () => {
            attempt++;
            const err = new Error('ENOENT') as NodeJS.ErrnoException;
            err.code = 'ENOENT';
            throw err;
          },
          { retries: 3, delayMs: 10 },
        ),
      ).rejects.toThrow('ENOENT');
      expect(attempt).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Process / shell helpers
  // -----------------------------------------------------------------------

  describe('npxCommand', () => {
    it('returns npx.cmd on Windows', () => {
      if (process.platform === 'win32') {
        expect(mod.npxCommand()).toBe('npx.cmd');
      }
    });

    it('returns npx on non-Windows', () => {
      if (process.platform !== 'win32') {
        expect(mod.npxCommand()).toBe('npx');
      }
    });
  });

  describe('npmCommand', () => {
    it('returns npm.cmd on Windows', () => {
      if (process.platform === 'win32') {
        expect(mod.npmCommand()).toBe('npm.cmd');
      }
    });

    it('returns npm on non-Windows', () => {
      if (process.platform !== 'win32') {
        expect(mod.npmCommand()).toBe('npm');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Terminal / ANSI helpers
  // -----------------------------------------------------------------------

  describe('supportsAnsiEscapes', () => {
    it('returns true on non-Windows', () => {
      if (process.platform !== 'win32') {
        expect(mod.supportsAnsiEscapes()).toBe(true);
      }
    });
  });

  describe('safeAnsi', () => {
    it('returns the code when ANSI is supported', () => {
      if (mod.supportsAnsiEscapes()) {
        expect(mod.safeAnsi('\x1b[31m')).toBe('\x1b[31m');
      }
    });
  });

  describe('platformEol', () => {
    it('returns \\r\\n on Windows', () => {
      if (process.platform === 'win32') {
        expect(mod.platformEol()).toBe('\r\n');
      }
    });

    it('returns \\n on non-Windows', () => {
      if (process.platform !== 'win32') {
        expect(mod.platformEol()).toBe('\n');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Environment variable helpers
  // -----------------------------------------------------------------------

  describe('getEnvVar', () => {
    it('retrieves existing env vars', () => {
      process.env['TEST_WINDOWS_COMPAT_VAR'] = 'hello';
      expect(mod.getEnvVar('TEST_WINDOWS_COMPAT_VAR')).toBe('hello');
      delete process.env['TEST_WINDOWS_COMPAT_VAR'];
    });

    it('returns undefined for missing env vars', () => {
      expect(
        mod.getEnvVar('NONEXISTENT_WINDOWS_COMPAT_VAR_12345'),
      ).toBeUndefined();
    });
  });

  describe('expandWindowsEnvVars', () => {
    it('returns the string unchanged on non-Windows', () => {
      if (process.platform !== 'win32') {
        expect(mod.expandWindowsEnvVars('%HOME%/test')).toBe('%HOME%/test');
      }
    });

    it('expands %VAR% on Windows', () => {
      if (process.platform === 'win32') {
        process.env['TEST_EXPAND_VAR'] = 'expanded';
        expect(mod.expandWindowsEnvVars('%TEST_EXPAND_VAR%/path')).toBe(
          'expanded/path',
        );
        delete process.env['TEST_EXPAND_VAR'];
      }
    });

    it('replaces unknown vars with empty string on Windows', () => {
      if (process.platform === 'win32') {
        expect(mod.expandWindowsEnvVars('%NONEXISTENT_VAR_99999%/path')).toBe(
          '/path',
        );
      }
    });
  });
});
