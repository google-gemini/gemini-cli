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
  isTmux,
  isGnuScreen,
  isLowColorTmux,
  isDumbTerminal,
  supports256Colors,
  supportsTrueColor,
  getCompatibilityWarnings,
  WarningPriority,
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
    it.each<{
      platform: NodeJS.Platform;
      release: string;
      expected: boolean;
      desc: string;
    }>([
      {
        platform: 'win32',
        release: '10.0.19041',
        expected: true,
        desc: 'Windows 10 (build < 22000)',
      },
      {
        platform: 'win32',
        release: '10.0.22000',
        expected: false,
        desc: 'Windows 11 (build >= 22000)',
      },
      {
        platform: 'darwin',
        release: '20.6.0',
        expected: false,
        desc: 'non-Windows platforms',
      },
    ])(
      'should return $expected for $desc',
      ({ platform, release, expected }) => {
        vi.mocked(os.platform).mockReturnValue(platform);
        vi.mocked(os.release).mockReturnValue(release);
        expect(isWindows10()).toBe(expected);
      },
    );
  });

  describe('isJetBrainsTerminal', () => {
    beforeEach(() => {
      vi.stubEnv('TERMINAL_EMULATOR', '');
      vi.stubEnv('JETBRAINS_IDE', '');
    });
    it.each<{
      env: Record<string, string>;
      expected: boolean;
      desc: string;
    }>([
      {
        env: { TERMINAL_EMULATOR: 'JetBrains-JediTerm' },
        expected: true,
        desc: 'TERMINAL_EMULATOR starts with JetBrains',
      },
      {
        env: { JETBRAINS_IDE: 'IntelliJ' },
        expected: true,
        desc: 'JETBRAINS_IDE is set',
      },
      {
        env: { TERMINAL_EMULATOR: 'xterm' },
        expected: false,
        desc: 'other terminals',
      },
      { env: {}, expected: false, desc: 'no env vars set' },
    ])('should return $expected when $desc', ({ env, expected }) => {
      vi.stubEnv('TERMINAL_EMULATOR', '');
      vi.stubEnv('JETBRAINS_IDE', '');
      for (const [key, value] of Object.entries(env)) {
        vi.stubEnv(key, value);
      }
      expect(isJetBrainsTerminal()).toBe(expected);
    });
  });

  describe('isTmux', () => {
    it('should return true when TMUX is set', () => {
      vi.stubEnv('TMUX', '/tmp/tmux-1001/default,1425,0');
      expect(isTmux()).toBe(true);
    });

    it('should return false when TMUX is not set', () => {
      vi.stubEnv('TMUX', '');
      expect(isTmux()).toBe(false);
    });
  });

  describe('isGnuScreen', () => {
    it('should return true when STY is set', () => {
      vi.stubEnv('STY', '1234.pts-0.host');
      expect(isGnuScreen()).toBe(true);
    });

    it('should return false when STY is not set', () => {
      vi.stubEnv('STY', '');
      expect(isGnuScreen()).toBe(false);
    });
  });

  describe('isLowColorTmux', () => {
    it('should return true when TERM=screen and COLORTERM is not set', () => {
      vi.stubEnv('TERM', 'screen');
      vi.stubEnv('TMUX', '1');
      vi.stubEnv('COLORTERM', '');
      expect(isLowColorTmux()).toBe(true);
    });

    it('should return false when TERM=screen and COLORTERM is set', () => {
      vi.stubEnv('TERM', 'screen');
      vi.stubEnv('TMUX', '1');
      vi.stubEnv('COLORTERM', 'truecolor');
      expect(isLowColorTmux()).toBe(false);
    });

    it('should return false when TERM=xterm-256color', () => {
      vi.stubEnv('TERM', 'xterm-256color');
      vi.stubEnv('COLORTERM', '');
      expect(isLowColorTmux()).toBe(false);
    });
  });

  describe('isDumbTerminal', () => {
    it('should return true when TERM=dumb', () => {
      vi.stubEnv('TERM', 'dumb');
      expect(isDumbTerminal()).toBe(true);
    });

    it('should return true when TERM=vt100', () => {
      vi.stubEnv('TERM', 'vt100');
      expect(isDumbTerminal()).toBe(true);
    });

    it('should return false when TERM=xterm', () => {
      vi.stubEnv('TERM', 'xterm');
      expect(isDumbTerminal()).toBe(false);
    });
  });

  describe('supports256Colors', () => {
    it.each<{
      depth: number;
      term?: string;
      expected: boolean;
      desc: string;
    }>([
      {
        depth: 8,
        term: undefined,
        expected: true,
        desc: 'getColorDepth returns >= 8',
      },
      {
        depth: 4,
        term: 'xterm-256color',
        expected: true,
        desc: 'TERM contains 256color',
      },
      {
        depth: 4,
        term: 'xterm',
        expected: false,
        desc: '256 colors are not supported',
      },
    ])('should return $expected when $desc', ({ depth, term, expected }) => {
      vi.stubEnv('COLORTERM', '');
      process.stdout.getColorDepth = vi.fn().mockReturnValue(depth);
      if (term !== undefined) {
        vi.stubEnv('TERM', term);
      } else {
        vi.stubEnv('TERM', '');
      }
      expect(supports256Colors()).toBe(expected);
    });

    it('should return true when COLORTERM is kmscon', () => {
      process.stdout.getColorDepth = vi.fn().mockReturnValue(4);
      vi.stubEnv('TERM', 'linux');
      vi.stubEnv('COLORTERM', 'kmscon');
      expect(supports256Colors()).toBe(true);
    });
  });

  describe('supportsTrueColor', () => {
    it.each<{
      colorterm: string;
      depth: number;
      expected: boolean;
      desc: string;
    }>([
      {
        colorterm: 'truecolor',
        depth: 8,
        expected: true,
        desc: 'COLORTERM is truecolor',
      },
      {
        colorterm: '24bit',
        depth: 8,
        expected: true,
        desc: 'COLORTERM is 24bit',
      },
      {
        colorterm: '',
        depth: 24,
        expected: true,
        desc: 'getColorDepth returns >= 24',
      },
      {
        colorterm: 'kmscon',
        depth: 4,
        expected: true,
        desc: 'COLORTERM is kmscon',
      },
      {
        colorterm: '',
        depth: 8,
        expected: false,
        desc: 'true color is not supported',
      },
    ])(
      'should return $expected when $desc',
      ({ colorterm, depth, expected }) => {
        vi.stubEnv('COLORTERM', colorterm);
        process.stdout.getColorDepth = vi.fn().mockReturnValue(depth);
        expect(supportsTrueColor()).toBe(expected);
      },
    );
  });

  describe('getCompatibilityWarnings', () => {
    beforeEach(() => {
      // Clear out potential local environment variables that might trigger warnings
      vi.stubEnv('TERMINAL_EMULATOR', '');
      vi.stubEnv('JETBRAINS_IDE', '');
      vi.stubEnv('TMUX', '');
      vi.stubEnv('STY', '');
      vi.stubEnv('TERM', 'xterm-256color'); // Prevent dumb terminal warning
      vi.stubEnv('TERM_PROGRAM', '');

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

    it('should return JetBrains warning when detected and in alternate buffer', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

      const warnings = getCompatibilityWarnings({ isAlternateBuffer: true });
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'jetbrains-terminal',
          message: expect.stringContaining('JetBrains terminal detected'),
          priority: WarningPriority.High,
        }),
      );
    });

    it('should return low-color tmux warning when detected', () => {
      vi.stubEnv('TERM', 'screen');
      vi.stubEnv('TMUX', '1');
      vi.stubEnv('COLORTERM', '');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'low-color-tmux',
          message: expect.stringContaining('Limited color support detected'),
          priority: WarningPriority.High,
        }),
      );
    });

    it('should return GNU screen warning when detected', () => {
      vi.stubEnv('STY', '1234.pts-0.host');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'gnu-screen',
          message: expect.stringContaining('GNU screen detected'),
          priority: WarningPriority.Low,
        }),
      );
    });

    it.each(['dumb', 'vt100'])(
      'should return dumb terminal warning when TERM=%s',
      (term) => {
        vi.stubEnv('TERM', term);

        const warnings = getCompatibilityWarnings();
        expect(warnings).toContainEqual(
          expect.objectContaining({
            id: 'dumb-terminal',
            message: `Warning: Basic terminal detected (TERM=${term}). Visual rendering will be limited. For the best experience, use a terminal emulator with truecolor support.`,
            priority: WarningPriority.High,
          }),
        );
      },
    );

    it('should not return JetBrains warning when detected but NOT in alternate buffer', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

      const warnings = getCompatibilityWarnings({ isAlternateBuffer: false });
      expect(
        warnings.find((w) => w.id === 'jetbrains-terminal'),
      ).toBeUndefined();
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
          priority: WarningPriority.High,
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
          priority: WarningPriority.Low,
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

      const warnings = getCompatibilityWarnings({ isAlternateBuffer: true });
      expect(warnings).toHaveLength(3);
      expect(warnings[0].message).toContain('Windows 10 detected');
      expect(warnings[1].message).toContain('JetBrains');
      expect(warnings[2].message).toContain(
        'True color (24-bit) support not detected',
      );
    });

    it('should return no color warnings for kmscon terminal', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.stubEnv('TERMINAL_EMULATOR', '');
      vi.stubEnv('TERM', 'linux');
      vi.stubEnv('COLORTERM', 'kmscon');
      process.stdout.getColorDepth = vi.fn().mockReturnValue(4);

      const warnings = getCompatibilityWarnings();
      expect(warnings.find((w) => w.id === '256-color')).toBeUndefined();
      expect(warnings.find((w) => w.id === 'true-color')).toBeUndefined();
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
