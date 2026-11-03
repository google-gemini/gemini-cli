/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isKnownSafeCommand, isDangerousCommand } from './commandSafety.js';

describe('Windows commandSafety', () => {
  describe('isKnownSafeCommand', () => {
    it('should identify known safe commands', () => {
      expect(isKnownSafeCommand(['dir'])).toBe(true);
      expect(isKnownSafeCommand(['echo', 'hello'])).toBe(true);
      expect(isKnownSafeCommand(['whoami'])).toBe(true);
    });

    it('should strip .exe extension for safe commands', () => {
      expect(isKnownSafeCommand(['dir.exe'])).toBe(true);
      expect(isKnownSafeCommand(['ECHO.EXE', 'hello'])).toBe(true);
      expect(isKnownSafeCommand(['WHOAMI.exe'])).toBe(true);
    });

    it('should reject unknown commands', () => {
      expect(isKnownSafeCommand(['unknown'])).toBe(false);
      expect(isKnownSafeCommand(['npm', 'install'])).toBe(false);
    });

    it('should reject safe commands when effectiveCwd is outside workspace', () => {
      expect(isKnownSafeCommand(['dir'], 'C:\\Windows', 'C:\\workspace')).toBe(
        false,
      );
    });

    it('should reject file-reading commands with options pointing outside workspace', () => {
      expect(
        isKnownSafeCommand(
          ['findstr', '/F:C:\\Windows\\win.ini', 'foo'],
          'C:\\workspace',
          'C:\\workspace',
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['findstr', '/F:subdir\\..\\..\\outside\\win.ini', 'foo'],
          'C:\\workspace',
          'C:\\workspace',
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['dir', '/Windows/win.ini'],
          'C:\\workspace',
          'C:\\workspace',
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['dir', '/windows'],
          'C:\\workspace',
          'C:\\workspace',
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['sort', 'C:\\Windows\\win.ini'],
          'C:\\workspace',
          'C:\\workspace',
        ),
      ).toBe(false);
    });

    it('should reject cd with switches escaping workspace and bare cd escaping', () => {
      expect(
        isKnownSafeCommand(
          ['cd', '-Path', '..\\outside'],
          'C:\\workspace',
          'C:\\workspace',
        ),
      ).toBe(false);
      expect(
        isKnownSafeCommand(
          ['cd', '/windows'],
          'C:\\workspace',
          'C:\\workspace',
        ),
      ).toBe(false);
      expect(isKnownSafeCommand(['cd'], 'C:\\workspace', 'C:\\workspace')).toBe(
        false,
      );
    });

    it('should allow file-reading commands with valid switches', () => {
      expect(
        isKnownSafeCommand(['dir', '/B'], 'C:\\workspace', 'C:\\workspace'),
      ).toBe(true);
      expect(
        isKnownSafeCommand(['findstr', '/s'], 'C:\\workspace', 'C:\\workspace'),
      ).toBe(true);
      expect(
        isKnownSafeCommand(
          ['sort', '-nonExistentFlag'],
          'C:\\workspace',
          'C:\\workspace',
        ),
      ).toBe(true);
    });

    it('should allow read-only git commands', () => {
      expect(isKnownSafeCommand(['git', 'status'])).toBe(true);
      expect(isKnownSafeCommand(['git', 'log', '--oneline', '-n', '5'])).toBe(
        true,
      );
      expect(isKnownSafeCommand(['git', 'diff', 'HEAD~1'])).toBe(true);
      expect(isKnownSafeCommand(['git', 'show', 'HEAD'])).toBe(true);
      expect(isKnownSafeCommand(['git', 'branch', '--show-current'])).toBe(
        true,
      );
      expect(isKnownSafeCommand(['GIT.EXE', 'status'])).toBe(true);
    });

    it('should reject git commands with flags that write files or run commands', () => {
      expect(
        isKnownSafeCommand([
          'git',
          'diff',
          '--no-index',
          'NUL',
          'NUL',
          '--output=C:\\Users\\me\\target.conf',
        ]),
      ).toBe(false);
      expect(isKnownSafeCommand(['git', 'diff', '--output', 'out.txt'])).toBe(
        false,
      );
      expect(isKnownSafeCommand(['git', 'log', '--output=out.txt'])).toBe(
        false,
      );
      expect(isKnownSafeCommand(['git', 'show', '--ext-diff'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'diff', '--textconv'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'log', '--paginate'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'log', '--exec=cmd'])).toBe(false);
    });

    it('should reject git branch commands that modify branches', () => {
      expect(isKnownSafeCommand(['git', 'branch', '-D', 'main'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'branch', 'new-branch'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'branch', '-m', 'old', 'new'])).toBe(
        false,
      );
    });

    it('should reject git commands with config overrides or global options', () => {
      expect(
        isKnownSafeCommand(['git', '-c', 'core.pager=calc.exe', 'log']),
      ).toBe(false);
      expect(
        isKnownSafeCommand(['git', '--config-env=core.pager=PAGER', 'log']),
      ).toBe(false);
      expect(isKnownSafeCommand(['git', '-C', '..\\other', 'status'])).toBe(
        false,
      );
      expect(
        isKnownSafeCommand(['git', '--git-dir=..\\other\\.git', 'log']),
      ).toBe(false);
      expect(isKnownSafeCommand(['git', '--exec-path=C:\\tools', 'log'])).toBe(
        false,
      );
      expect(isKnownSafeCommand(['git', '--no-pager', 'log'])).toBe(false);
    });

    it('should reject git commands with PowerShell escape characters', () => {
      expect(isKnownSafeCommand(['git', 'diff', '--out`put=target.conf'])).toBe(
        false,
      );
    });

    it('should reject git commands with cmd.exe escapes or variable expansion', () => {
      expect(isKnownSafeCommand(['git', 'diff', '--out^put=target.conf'])).toBe(
        false,
      );
      expect(
        isKnownSafeCommand(['git', 'diff', '--out%PATH:~0,0%put=target.conf']),
      ).toBe(false);
      expect(isKnownSafeCommand(['git', 'diff', '--out!X!put=t.conf'])).toBe(
        false,
      );
      expect(isDangerousCommand(['git', 'diff', '--out^put=target.conf'])).toBe(
        true,
      );
    });

    it('should reject git diff --no-index', () => {
      expect(
        isKnownSafeCommand([
          'git',
          'diff',
          '--no-index',
          'C:\\Windows\\win.ini',
          'out.txt',
        ]),
      ).toBe(false);
    });

    it('should allow git format strings containing %', () => {
      expect(isKnownSafeCommand(['git', 'log', '--format=%H'])).toBe(true);
      expect(isKnownSafeCommand(['git', 'log', '--pretty=format:%h %s'])).toBe(
        true,
      );
      expect(
        isKnownSafeCommand(['git', 'branch', '--format=%(refname:short)']),
      ).toBe(true);
    });

    it('should require confirmation for git arguments outside the read-only allowlist', () => {
      expect(isKnownSafeCommand(['git', 'branch', '--merged'])).toBe(false);
      expect(
        isKnownSafeCommand(['git', 'branch', '--contains', 'abc123']),
      ).toBe(false);
      expect(isKnownSafeCommand(['git', 'branch', '--list', 'feat/*'])).toBe(
        false,
      );
      expect(isKnownSafeCommand(['git', 'log', '-c'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'Status'])).toBe(false);
    });

    it('should reject git subcommands that are not read-only', () => {
      expect(isKnownSafeCommand(['git', 'commit', '-m', 'msg'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'push'])).toBe(false);
    });
  });

  describe('isDangerousCommand', () => {
    it('should identify dangerous commands', () => {
      expect(isDangerousCommand(['del', 'file.txt'])).toBe(true);
      expect(isDangerousCommand(['powershell', '-Command', 'echo'])).toBe(true);
      expect(isDangerousCommand(['cmd', '/c', 'dir'])).toBe(true);
    });

    it('should strip .exe extension for dangerous commands', () => {
      expect(isDangerousCommand(['del.exe', 'file.txt'])).toBe(true);
      expect(isDangerousCommand(['POWERSHELL.EXE', '-Command', 'echo'])).toBe(
        true,
      );
      expect(isDangerousCommand(['cmd.exe', '/c', 'dir'])).toBe(true);
    });

    it('should not flag safe commands as dangerous', () => {
      expect(isDangerousCommand(['dir'])).toBe(false);
      expect(isDangerousCommand(['echo', 'hello'])).toBe(false);
    });

    it('should flag git commands with flags that write files or run commands', () => {
      expect(
        isDangerousCommand([
          'git',
          'diff',
          '--no-index',
          'NUL',
          'NUL',
          '--output=C:\\Users\\me\\target.conf',
        ]),
      ).toBe(true);
      expect(
        isDangerousCommand(['git', '-c', 'core.pager=calc.exe', 'log']),
      ).toBe(true);
      expect(isDangerousCommand(['git', 'branch', '-D', 'main'])).toBe(true);
      expect(isDangerousCommand(['GIT.exe', 'show', '--ext-diff'])).toBe(true);
      expect(isDangerousCommand(['git', 'diff', '--out`put=target.conf'])).toBe(
        true,
      );
    });

    it('should not flag read-only git commands as dangerous', () => {
      expect(isDangerousCommand(['git', 'status'])).toBe(false);
      expect(isDangerousCommand(['git', 'log', '--oneline'])).toBe(false);
      expect(isDangerousCommand(['git', 'branch', '--show-current'])).toBe(
        false,
      );
    });
  });
});
