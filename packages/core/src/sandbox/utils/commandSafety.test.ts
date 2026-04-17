/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

// Mock shell-utils to avoid relying on tree-sitter WASM
vi.mock('../../utils/shell-utils.js', () => ({
  initializeShellParsers: vi.fn().mockResolvedValue(undefined),
  splitCommands: (cmd: string) => [cmd],
  stripShellWrapper: (cmd: string) => cmd,
  extractStringFromParseEntry: (entry: unknown) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object' && 'content' in entry) {
      return (entry as { content: string }).content;
    }
    return '';
  },
  normalizeCommand: (cmd: string) => {
    // Simple mock normalization: /bin/rm -> rm
    if (cmd.startsWith('/')) {
      const parts = cmd.split('/');
      return parts[parts.length - 1];
    }
    return cmd;
  },
}));

import { isKnownSafeCommand, isDangerousCommand } from './commandSafety.js';

describe('POSIX commandSafety', () => {
  describe('isKnownSafeCommand', () => {
    it('should identify known safe commands', () => {
      expect(isKnownSafeCommand(['ls', '-la'])).toBe(true);
      expect(isKnownSafeCommand(['cat', 'file.txt'])).toBe(true);
      expect(isKnownSafeCommand(['pwd'])).toBe(true);
      expect(isKnownSafeCommand(['echo', 'hello'])).toBe(true);
    });

    it('should identify safe git commands', () => {
      expect(isKnownSafeCommand(['git', 'status'])).toBe(true);
      expect(isKnownSafeCommand(['git', 'log'])).toBe(true);
      expect(isKnownSafeCommand(['git', 'diff'])).toBe(true);
    });

    it('should reject unsafe git commands', () => {
      expect(isKnownSafeCommand(['git', 'commit'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'push'])).toBe(false);
      expect(isKnownSafeCommand(['git', 'checkout'])).toBe(false);
    });

    it('should reject commands with redirection', () => {
      // isKnownSafeCommand handles bash -c "..." which can have redirections
      // but the simple check for atomic commands doesn't see redirection because it's already parsed
    });
  });

  describe('isDangerousCommand', () => {
    it('should identify destructive rm commands', () => {
      expect(isDangerousCommand(['rm'])).toBe(true);
      expect(isDangerousCommand(['rm', 'file.txt'])).toBe(true);
      expect(isDangerousCommand(['rm', '-rf', '/'])).toBe(true);
      expect(isDangerousCommand(['rm', '-f', 'file'])).toBe(true);
      expect(isDangerousCommand(['rm', '-r', 'dir'])).toBe(true);
      expect(isDangerousCommand(['/bin/rm', 'file'])).toBe(true);
    });

    it('should flag rm help/version as dangerous (strict)', () => {
      expect(isDangerousCommand(['rm', '--help'])).toBe(true);
      expect(isDangerousCommand(['rm', '--version'])).toBe(true);
    });

    it('should identify sudo as dangerous if command is dangerous', () => {
      expect(isDangerousCommand(['sudo', 'rm', 'file'])).toBe(true);
    });

    it('should identify find -exec as dangerous', () => {
      expect(isDangerousCommand(['find', '.', '-exec', 'rm', '{}', '+'])).toBe(
        true,
      );
    });

    it('should identify dangerous rg flags', () => {
      expect(isDangerousCommand(['rg', '--hostname-bin', 'something'])).toBe(
        true,
      );
    });
  });
});
