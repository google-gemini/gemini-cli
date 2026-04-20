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

    it('should reject unsafe git commands', () => {
      expect(isKnownSafeCommand(['git', 'commit'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'push'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'checkout'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'log', '--output=file.txt'])).toBe(
        false,
      );
    });
  });

  describe('isDangerousCommand', () => {
    it('should identify dangerous commands', () => {
      expect(isDangerousCommand(['del', 'file.txt'])).toBe(true);
      expect(isDangerousCommand(['powershell', '-Command', 'echo'])).toBe(true);
      expect(isDangerousCommand(['cmd', '/c', 'dir'])).toBe(true);
    });

    it('should reject unsafe git commands as dangerous', () => {
      expect(isDangerousCommand(['git', 'log', '--output=file.txt'])).toBe(
        true,
      );
      expect(isDangerousCommand(['git', '-c', 'alias.foo=!sh', 'status'])).toBe(
        true,
      );
    });

    it('should identify path-qualified dangerous commands', () => {
      expect(
        isDangerousCommand(['C:\\Windows\\System32\\del.exe', 'file.txt']),
      ).toBe(true);
    });

    it('should strip .exe extension for dangerous commands', () => {
      expect(isDangerousCommand(['del.exe', 'file.txt'])).toBe(true);
      expect(isDangerousCommand(['POWERSHELL.EXE', '-Command', 'echo'])).toBe(
        true,
      );
      expect(isDangerousCommand(['cmd.exe', '/c', 'dir'])).toBe(true);
    });

    it('should strip multiple trailing dots and extensions for dangerous commands', () => {
      expect(isDangerousCommand(['powershell.', '-Command', 'echo'])).toBe(
        true,
      );
      expect(isDangerousCommand(['powershell.exe.', '-Command', 'echo'])).toBe(
        true,
      );
      expect(isDangerousCommand(['cmd.bat..', '/c', 'dir'])).toBe(true);
    });

    it('should flag rm as dangerous', () => {
      expect(isDangerousCommand(['rm', 'file'])).toBe(true);
      expect(isDangerousCommand(['rm.exe', 'file'])).toBe(true);
    });

    it('should identify dangerous commands wrapped in env', () => {
      expect(isDangerousCommand(['env', 'rm', '-rf', '/'])).toBe(true);
      expect(isDangerousCommand(['env', '-i', 'rm', '-rf', '/'])).toBe(true);
      expect(isDangerousCommand(['env', '-u', 'USER', 'rm', '-rf', '/'])).toBe(
        true,
      );
      expect(isDangerousCommand(['env', 'VAR=val', 'rm', '-rf', '/'])).toBe(
        true,
      );
      expect(isDangerousCommand(['env', '--', 'rm', '-rf', '/'])).toBe(true);
    });

    it('should identify dangerous commands wrapped in xargs', () => {
      expect(isDangerousCommand(['xargs', 'rm', '-rf', '/'])).toBe(true);
      expect(isDangerousCommand(['xargs', '-I', '{}', 'rm', '{}'])).toBe(true);
      expect(isDangerousCommand(['xargs', '-n', '1', 'rm'])).toBe(true);
      expect(isDangerousCommand(['xargs', '-0', 'rm'])).toBe(true);
      expect(isDangerousCommand(['xargs', '--', 'rm'])).toBe(true);
    });

    it('should not flag safe commands as dangerous', () => {
      expect(isDangerousCommand(['dir'])).toBe(false);
      expect(isDangerousCommand(['echo', 'hello'])).toBe(false);
    });
  });
});
