/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'node:os';
import { getCompatibilityWarnings, WarningPriority } from './compatibility.js';

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

  describe('getCompatibilityWarnings', () => {
    const defaultEnv = {
      isTmux: false,
      isJetBrains: false,
      isWindowsTerminal: false,
      isVSCode: false,
      isITerm2: false,
      isGhostty: false,
      isAppleTerminal: false,
      isWindows10: false,
      supports256Colors: true,
      supportsTrueColor: true,
    };

    it('should return Windows 10 warning when detected', () => {
      const termEnv = { ...defaultEnv, isWindows10: true };

      const warnings = getCompatibilityWarnings({ termEnv });
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'windows-10',
          message: expect.stringContaining('Windows 10 detected'),
        }),
      );
    });

    it.each<{
      platform: NodeJS.Platform;
      externalTerminal: string;
      desc: string;
    }>([
      {
        platform: 'darwin',
        externalTerminal: 'iTerm2 or Ghostty',
        desc: 'macOS',
      },
      {
        platform: 'win32',
        externalTerminal: 'Windows Terminal',
        desc: 'Windows',
      },
      {
        platform: 'linux',
        externalTerminal: 'Ghostty',
        desc: 'Linux',
      },
    ])(
      'should return JetBrains warning when detected and in alternate buffer ($desc)',
      ({ platform, externalTerminal }) => {
        vi.mocked(os.platform).mockReturnValue(platform);
        const termEnv = { ...defaultEnv, isJetBrains: true };

        const warnings = getCompatibilityWarnings({
          isAlternateBuffer: true,
          termEnv,
        });
        expect(warnings).toContainEqual(
          expect.objectContaining({
            id: 'jetbrains-terminal',
            message: expect.stringContaining(
              `Warning: JetBrains mouse scrolling is unreliable with alternate buffer enabled. Using an external terminal (e.g., ${externalTerminal}) or disabling alternate buffer in settings is recommended.`,
            ),
            priority: WarningPriority.High,
          }),
        );
      },
    );

    it('should not return JetBrains warning when detected but NOT in alternate buffer', () => {
      const termEnv = { ...defaultEnv, isJetBrains: true };

      const warnings = getCompatibilityWarnings({
        isAlternateBuffer: false,
        termEnv,
      });
      expect(
        warnings.find((w) => w.id === 'jetbrains-terminal'),
      ).toBeUndefined();
    });

    it('should return 256-color warning when 256 colors are not supported', () => {
      const termEnv = {
        ...defaultEnv,
        supports256Colors: false,
        supportsTrueColor: false,
      };

      const warnings = getCompatibilityWarnings({ termEnv });
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
      vi.stubEnv('TERM_PROGRAM', 'xterm');
      const termEnv = {
        ...defaultEnv,
        supports256Colors: true,
        supportsTrueColor: false,
      };

      const warnings = getCompatibilityWarnings({ termEnv });
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
      vi.stubEnv('TERM_PROGRAM', 'Apple_Terminal');
      const termEnv = {
        ...defaultEnv,
        isAppleTerminal: true,
        supports256Colors: true,
        supportsTrueColor: false,
      };

      const warnings = getCompatibilityWarnings({ termEnv });
      expect(warnings.find((w) => w.id === 'true-color')).toBeUndefined();
    });
  });
});
