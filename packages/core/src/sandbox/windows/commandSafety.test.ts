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
  });
});
