/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import {
  isWindows10,
  isJetBrainsTerminal,
  supports256Colors,
  supportsTrueColor,
  getCompatibilityWarnings,
} from './compatibility.js';

vi.mock('node:os', () => ({
  default: {
    platform: vi.fn(),
    release: vi.fn(),
  },
}));

describe('compatibility', () => {
  const originalGetColorDepth = process.stdout.getColorDepth;

  afterEach(() => {
    process.stdout.getColorDepth = originalGetColorDepth;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('isWindows10', () => {
    it('should return true for Windows 10 (build < 22000)', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.19041');
      expect(isWindows10()).toBe(true);
    });

    it('should return false for Windows 11 (build >= 22000)', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.22000');
      expect(isWindows10()).toBe(false);
    });

    it('should return false for non-Windows platforms', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.mocked(os.release).mockReturnValue('20.6.0');
      expect(isWindows10()).toBe(false);
    });
  });

  describe('isJetBrainsTerminal', () => {
    it('should return true when TERMINAL_EMULATOR is JetBrains-JediTerm', () => {
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
      expect(isJetBrainsTerminal()).toBe(true);
    });

    it('should return false for other terminals', () => {
      vi.stubEnv('TERMINAL_EMULATOR', 'something-else');
      expect(isJetBrainsTerminal()).toBe(false);
    });

    it('should return false when TERMINAL_EMULATOR is not set', () => {
      vi.stubEnv('TERMINAL_EMULATOR', '');
      expect(isJetBrainsTerminal()).toBe(false);
    });
  });

  describe('supports256Colors', () => {
    it('should return true when getColorDepth returns >= 8', () => {
      process.stdout.getColorDepth = vi.fn().mockReturnValue(8);
      expect(supports256Colors()).toBe(true);
    });

    it('should return true when TERM contains 256color', () => {
      process.stdout.getColorDepth = vi.fn().mockReturnValue(4);
      vi.stubEnv('TERM', 'xterm-256color');
      expect(supports256Colors()).toBe(true);
    });

    it('should return false when 256 colors are not supported', () => {
      process.stdout.getColorDepth = vi.fn().mockReturnValue(4);
      vi.stubEnv('TERM', 'xterm');
      expect(supports256Colors()).toBe(false);
    });
  });

  describe('supportsTrueColor', () => {
    it('should return true when COLORTERM is truecolor', () => {
      vi.stubEnv('COLORTERM', 'truecolor');
      expect(supportsTrueColor()).toBe(true);
    });

    it('should return true when COLORTERM is 24bit', () => {
      vi.stubEnv('COLORTERM', '24bit');
      expect(supportsTrueColor()).toBe(true);
    });

    it('should return true when getColorDepth returns >= 24', () => {
      vi.stubEnv('COLORTERM', '');
      process.stdout.getColorDepth = vi.fn().mockReturnValue(24);
      expect(supportsTrueColor()).toBe(true);
    });

    it('should return false when true color is not supported', () => {
      vi.stubEnv('COLORTERM', '');
      process.stdout.getColorDepth = vi.fn().mockReturnValue(8);
      expect(supportsTrueColor()).toBe(false);
    });
  });

  describe('getCompatibilityWarnings', () => {
    beforeEach(() => {
      // Default to supporting true color to keep existing tests simple
      vi.stubEnv('COLORTERM', 'truecolor');
      process.stdout.getColorDepth = vi.fn().mockReturnValue(24);
    });

    it('should return Windows 10 warning when detected', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.19041');
      vi.stubEnv('TERMINAL_EMULATOR', '');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'windows-10',
          message: expect.stringContaining('Windows 10 detected'),
        }),
      );
    });

    it('should return JetBrains warning when detected on macOS', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'jetbrains-terminal',
          message: expect.stringContaining('iTerm2 or Terminal.app'),
        }),
      );
    });

    it('should return JetBrains warning with Windows Terminal recommendation on Windows', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.22000');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'jetbrains-terminal',
          message: expect.stringContaining('Windows Terminal'),
        }),
      );
    });

    it('should return JetBrains warning with native terminal recommendation on Linux', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'jetbrains-terminal',
          message: expect.stringContaining('native terminal emulator'),
        }),
      );
    });

    it('should return 256-color warning when 256 colors are not supported', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.stubEnv('TERMINAL_EMULATOR', '');
      vi.stubEnv('COLORTERM', '');
      vi.stubEnv('TERM', 'xterm');
      process.stdout.getColorDepth = vi.fn().mockReturnValue(4);

      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: '256-color',
          message: expect.stringContaining('256-color support not detected'),
          priority: 'high',
        }),
      );
      // Should NOT show true-color warning if 256-color warning is shown
      expect(warnings.find((w) => w.id === 'true-color')).toBeUndefined();
    });

    it('should return true color warning when 256 colors are supported but true color is not, and not Apple Terminal', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.stubEnv('TERMINAL_EMULATOR', '');
      vi.stubEnv('COLORTERM', '');
      vi.stubEnv('TERM_PROGRAM', 'xterm');
      process.stdout.getColorDepth = vi.fn().mockReturnValue(8);

      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'true-color',
          message: expect.stringContaining(
            'True color (24-bit) support not detected',
          ),
          priority: 'low',
        }),
      );
    });

    it('should NOT return true color warning for Apple Terminal', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.stubEnv('TERMINAL_EMULATOR', '');
      vi.stubEnv('COLORTERM', '');
      vi.stubEnv('TERM_PROGRAM', 'Apple_Terminal');
      process.stdout.getColorDepth = vi.fn().mockReturnValue(8);

      const warnings = getCompatibilityWarnings();
      expect(warnings.find((w) => w.id === 'true-color')).toBeUndefined();
    });

    it('should return all warnings when all are detected', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.19041');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
      vi.stubEnv('COLORTERM', '');
      vi.stubEnv('TERM_PROGRAM', 'xterm');
      process.stdout.getColorDepth = vi.fn().mockReturnValue(8);

      const warnings = getCompatibilityWarnings();
      expect(warnings).toHaveLength(3);
      expect(warnings[0].message).toContain('Windows 10 detected');
      expect(warnings[1].message).toContain('JetBrains terminal detected');
      expect(warnings[1].message).toContain('Windows Terminal');
      expect(warnings[2].message).toContain(
        'True color (24-bit) support not detected',
      );
    });

    it('should return no warnings in a standard environment with true color', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.stubEnv('TERMINAL_EMULATOR', '');
      vi.stubEnv('COLORTERM', 'truecolor');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toHaveLength(0);
    });
  });
});
