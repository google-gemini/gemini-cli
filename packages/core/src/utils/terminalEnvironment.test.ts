/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  detectTerminalEnvironment,
  getTerminalCapabilities,
  getTerminalWarnings,
  WarningPriority,
} from './terminalEnvironment.js';

describe('terminalEnvironment', () => {
  const originalGetColorDepth = process.stdout.getColorDepth;
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    process.stdout.getColorDepth = originalGetColorDepth;
    process.stdout.isTTY = originalIsTTY;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('detectTerminalEnvironment', () => {
    it('detects tmux via env var', () => {
      const env = { TMUX: '/tmp/tmux-1000/default,123,0' };
      const result = detectTerminalEnvironment(env);
      expect(result.isTmux).toBe(true);
    });

    it('detects tmux via TERM', () => {
      const env = { TERM: 'screen.tmux' };
      const result = detectTerminalEnvironment(env);
      expect(result.isTmux).toBe(true);
    });

    it('detects JetBrains via IDEA_INITIAL_DIRECTORY', () => {
      const env = { IDEA_INITIAL_DIRECTORY: '/home/user/project' };
      const result = detectTerminalEnvironment(env);
      expect(result.isJetBrains).toBe(true);
    });

    it('detects JetBrains via TERMINAL_EMULATOR', () => {
      const env = { TERMINAL_EMULATOR: 'JetBrains-JediTerm' };
      const result = detectTerminalEnvironment(env);
      expect(result.isJetBrains).toBe(true);
    });

    it('detects Windows Terminal', () => {
      const env = { WT_SESSION: 'uuid' };
      const result = detectTerminalEnvironment(env);
      expect(result.isWindowsTerminal).toBe(true);
    });

    it('detects VS Code', () => {
      const env = { TERM_PROGRAM: 'vscode' };
      const result = detectTerminalEnvironment(env);
      expect(result.isVSCode).toBe(true);
    });

    it('detects color support via getColorDepth', () => {
      process.stdout.isTTY = true;
      process.stdout.getColorDepth = vi.fn().mockReturnValue(24);
      const result = detectTerminalEnvironment({});
      expect(result.supportsTrueColor).toBe(true);
      expect(result.supports256Colors).toBe(true);
    });

    it('detects color support via COLORTERM', () => {
      process.stdout.getColorDepth = vi.fn().mockReturnValue(4);
      const result = detectTerminalEnvironment({ COLORTERM: 'truecolor' });
      expect(result.supportsTrueColor).toBe(true);
      expect(result.supports256Colors).toBe(true);
    });

    it('detects 256 color support via TERM', () => {
      process.stdout.getColorDepth = vi.fn().mockReturnValue(4);
      const result = detectTerminalEnvironment({ TERM: 'xterm-256color' });
      expect(result.supportsTrueColor).toBe(false);
      expect(result.supports256Colors).toBe(true);
    });
  });

  describe('getTerminalCapabilities', () => {
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

    it('disables alt buffer in JetBrains by default', () => {
      const env = { ...defaultEnv, isJetBrains: true };
      const { capabilities, reasons } = getTerminalCapabilities(env);
      expect(capabilities.supportsAltBuffer).toBe(false);
      expect(reasons.supportsAltBuffer).toContain('JetBrains');
    });

    it('disables reliable backbuffer clear in tmux', () => {
      const env = { ...defaultEnv, isTmux: true };
      const { capabilities, reasons } = getTerminalCapabilities(env);
      expect(capabilities.supportsReliableBackbufferClear).toBe(false);
      expect(reasons.supportsReliableBackbufferClear).toContain('tmux');
    });

    it('disables mouse in Windows Terminal on Windows 10', () => {
      const env = { ...defaultEnv, isWindowsTerminal: true, isWindows10: true };
      const { capabilities, reasons } = getTerminalCapabilities(env);
      expect(capabilities.supportsMouse).toBe(false);
      expect(reasons.supportsMouse).toContain('Windows 10');
    });

    it('keeps features enabled in trusted terminals (e.g., Ghostty)', () => {
      const env = { ...defaultEnv, isGhostty: true };
      const { capabilities } = getTerminalCapabilities(env);
      expect(capabilities.supportsAltBuffer).toBe(true);
      expect(capabilities.supportsMouse).toBe(true);
      expect(capabilities.supportsReliableBackbufferClear).toBe(true);
    });

    it('respects force alt buffer override in JetBrains', () => {
      const env = { ...defaultEnv, isJetBrains: true };
      const processEnv = { GEMINI_CLI_FORCE_ALT_BUFFER: '1' };
      const { capabilities, warnings } = getTerminalCapabilities(
        env,
        processEnv,
      );
      expect(capabilities.supportsAltBuffer).toBe(true);
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain('Warning: Forced alternate buffer');
    });

    it('respects settings override for alt buffer', () => {
      const env = { ...defaultEnv };
      const { capabilities } = getTerminalCapabilities(
        env,
        {},
        { disableAltBuffer: true },
      );
      expect(capabilities.supportsAltBuffer).toBe(false);
    });

    it('respects assume trusted terminal override', () => {
      const env = { ...defaultEnv, isJetBrains: true, isTmux: true };
      const { capabilities, reasons } = getTerminalCapabilities(env, {
        GEMINI_CLI_ASSUME_TRUSTED_TERMINAL: '1',
      });
      expect(capabilities.supportsAltBuffer).toBe(true);
      expect(capabilities.supportsReliableBackbufferClear).toBe(true);
      expect(Object.keys(reasons).length).toBe(0);
    });
  });

  describe('getTerminalWarnings', () => {
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

    it('returns Windows 10 warning', () => {
      const env = { ...defaultEnv, isWindows10: true };
      const warnings = getTerminalWarnings(env);
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'windows-10',
          priority: WarningPriority.High,
        }),
      );
    });

    it('returns JetBrains warning in alt buffer', () => {
      const env = { ...defaultEnv, isJetBrains: true };
      const warnings = getTerminalWarnings(env, { isAlternateBuffer: true });
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'jetbrains-terminal',
          priority: WarningPriority.High,
        }),
      );
    });

    it('returns 256-color warning', () => {
      const env = { ...defaultEnv, supports256Colors: false };
      const warnings = getTerminalWarnings(env);
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: '256-color',
        }),
      );
    });

    it('returns true-color warning', () => {
      const env = { ...defaultEnv, supportsTrueColor: false };
      const warnings = getTerminalWarnings(env);
      expect(warnings).toContainEqual(
        expect.objectContaining({
          id: 'true-color',
          priority: WarningPriority.Low,
        }),
      );
    });
  });
});
