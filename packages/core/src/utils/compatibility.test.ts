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
    it.each<{ env: string; expected: boolean; desc: string }>([
      {
        env: 'JetBrains-JediTerm',
        expected: true,
        desc: 'TERMINAL_EMULATOR is JetBrains-JediTerm',
      },
      { env: 'something-else', expected: false, desc: 'other terminals' },
      { env: '', expected: false, desc: 'TERMINAL_EMULATOR is not set' },
    ])('should return $expected when $desc', ({ env, expected }) => {
      vi.stubEnv('TERMINAL_EMULATOR', env);
      expect(isJetBrainsTerminal()).toBe(expected);
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
      process.stdout.getColorDepth = vi.fn().mockReturnValue(depth);
      if (term !== undefined) {
        vi.stubEnv('TERM', term);
      }
      expect(supports256Colors()).toBe(expected);
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

    it.each<{
      platform: NodeJS.Platform;
      release: string;
      externalTerminal: string;
      desc: string;
    }>([
      {
        platform: 'darwin',
        release: '20.6.0',
        externalTerminal: 'iTerm2 or Ghostty',
        desc: 'macOS',
      },
      {
        platform: 'win32',
        release: '10.0.22000',
        externalTerminal: 'Windows Terminal',
        desc: 'Windows',
      }, // Valid Windows 11 release to not trigger the Windows 10 warning
      {
        platform: 'linux',
        release: '5.10.0',
        externalTerminal: 'Ghostty',
        desc: 'Linux',
      },
    ])(
      'should return JetBrains warning when detected and in alternate buffer ($desc)',
      ({ platform, release, externalTerminal }) => {
        vi.mocked(os.platform).mockReturnValue(platform);
        vi.mocked(os.release).mockReturnValue(release);
        vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

        const warnings = getCompatibilityWarnings({ isAlternateBuffer: true });
        expect(warnings).toContainEqual(
          expect.objectContaining({
            id: 'jetbrains-terminal',
            message: expect.stringContaining(
              `Warning: JetBrains mouse scrolling is unreliable. Disabling alternate buffer mode in settings or using an external terminal (e.g., ${externalTerminal}) is recommended.`,
            ),
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

    it('should return no warnings in a standard environment with true color', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.stubEnv('TERMINAL_EMULATOR', '');
      vi.stubEnv('COLORTERM', 'truecolor');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toHaveLength(0);
    });
  });
});
