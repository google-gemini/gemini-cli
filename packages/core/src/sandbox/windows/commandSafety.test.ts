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
