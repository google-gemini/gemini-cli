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
  getCompatibilityWarnings,
} from './compatibility.js';

vi.mock('node:os', () => ({
  default: {
    platform: vi.fn(),
    release: vi.fn(),
  },
}));

describe('compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
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

  describe('getCompatibilityWarnings', () => {
    it('should return Windows 10 warning when detected', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.19041');
      vi.stubEnv('TERMINAL_EMULATOR', '');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Windows 10 detected');
    });

    it('should return JetBrains warning when detected', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('JetBrains terminal detected');
    });

    it('should return both warnings when both are detected', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      vi.mocked(os.release).mockReturnValue('10.0.19041');
      vi.stubEnv('TERMINAL_EMULATOR', 'JetBrains-JediTerm');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain('Windows 10 detected');
      expect(warnings[1]).toContain('JetBrains terminal detected');
    });

    it('should return no warnings in a standard environment', () => {
      vi.mocked(os.platform).mockReturnValue('darwin');
      vi.stubEnv('TERMINAL_EMULATOR', '');

      const warnings = getCompatibilityWarnings();
      expect(warnings).toHaveLength(0);
    });
  });
});
