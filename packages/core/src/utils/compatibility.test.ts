/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'node:os';
import {
  isWindows10,
  isJetBrainsTerminal,
  supports256Colors,
  supportsTrueColor,
  getCompatibilityWarnings,
  WarningPriority,
  isTmux,
  supportsKeyboardProtocolHeuristic,
} from './compatibility.js';

vi.mock('node:os', () => ({
  default: {
    platform: vi.fn(),
    release: vi.fn(),
  },
}));

describe('compatibility', () => {
  const originalGetColorDepth = process.stdout.getColorDepth;
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    process.stdout.getColorDepth = originalGetColorDepth;
    process.stdout.isTTY = originalIsTTY;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('isWindows10', () => {
    it('should return true for Windows 10', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.19041');
      expect(isWindows10()).toBe(true);
    });

    it('should return false for Windows 11', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.22000');
      expect(isWindows10()).toBe(false);
    });

    it('should return false for non-Windows', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      expect(isWindows10()).toBe(false);
    });
  });

  describe('isJetBrainsTerminal', () => {
    it('should detect JetBrains terminal via env var', () => {
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');
      expect(isJetBrainsTerminal()).toBe(true);
    });
  });

  describe('isTmux', () => {
    it('should detect tmux via TMUX env var', () => {
      vi.stubEnv('TMUX', '/tmp/tmux-1000/default,123,0');
      expect(isTmux()).toBe(true);
    });
  });

  describe('supports256Colors', () => {
    it('should return true if getColorDepth returns 8', () => {
      process.stdout.getColorDepth = vi.fn().mockReturnValue(8);
      expect(supports256Colors()).toBe(true);
    });

    it('should return true if TERM includes 256color', () => {
      process.stdout.getColorDepth = vi.fn().mockReturnValue(4);
      vi.stubEnv('TERM', 'xterm-256color');
      expect(supports256Colors()).toBe(true);
    });
  });

  describe('supportsTrueColor', () => {
    it('should return true if COLORTERM is truecolor', () => {
      vi.stubEnv('COLORTERM', 'truecolor');
      expect(supportsTrueColor()).toBe(true);
    });

    it('should return true if getColorDepth returns 24', () => {
      process.stdout.getColorDepth = vi.fn().mockReturnValue(24);
      expect(supportsTrueColor()).toBe(true);
    });
  });

  describe('supportsKeyboardProtocolHeuristic', () => {
    it('should return true for Ghostty', () => {
      vi.stubEnv('TERM_PROGRAM', 'ghostty');
      expect(supportsKeyboardProtocolHeuristic()).toBe(true);
    });

    it('should return false for Apple Terminal', () => {
      vi.stubEnv('TERM_PROGRAM', 'Apple_Terminal');
      expect(supportsKeyboardProtocolHeuristic()).toBe(false);
    });
  });

  describe('getCompatibilityWarnings', () => {
    it('should return Windows 10 warning when detected', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.19041');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'windows-10',
          priority: WarningPriority.High,
        }),
      );
    });

    it('should return JetBrains warning when detected and in alt buffer', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

      const warnings = getCompatibilityWarnings({ isAlternateBuffer: true });
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'jetbrains-terminal',
          priority: WarningPriority.High,
        }),
      );
    });

    it('should return tmux warning', () => {
      vi.stubEnv('TMUX', '/tmp/tmux-1000/default,123,0');
      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'tmux-mouse-support',
          priority: WarningPriority.Low,
        }),
      );
    });

    it('should return keyboard protocol warning', () => {
      vi.stubEnv('TERM_PROGRAM', 'Apple_Terminal');
      const warnings = getCompatibilityWarnings({
        supportsKeyboardProtocol: false,
      });
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'keyboard-protocol',
          priority: WarningPriority.Low,
        }),
      );
    });
  });
});
