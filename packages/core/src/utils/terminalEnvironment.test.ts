/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { TerminalType, detectTerminalType } from './terminalEnvironment.js';

describe('terminalEnvironment', () => {
  describe('detectTerminalType', () => {
    it('should detect JetBrains', () => {
      expect(
        detectTerminalType({ TERMINAL_EMULATOR: 'JetBrains-JediTerm' }),
      ).toBe(TerminalType.JetBrains);
      expect(detectTerminalType({ IDEA_INITIAL_DIRECTORY: '/some/path' })).toBe(
        TerminalType.JetBrains,
      );
    });

    it('should detect tmux', () => {
      expect(detectTerminalType({ TMUX: '/tmp/tmux-1000/default,123,0' })).toBe(
        TerminalType.Tmux,
      );
      expect(detectTerminalType({ TERM: 'screen-256color' })).not.toBe(
        TerminalType.Tmux,
      );
      expect(detectTerminalType({ TERM: 'tmux-256color' })).toBe(
        TerminalType.Tmux,
      );
    });

    it('should detect VSCode', () => {
      expect(detectTerminalType({ TERM_PROGRAM: 'vscode' })).toBe(
        TerminalType.VSCode,
      );
      expect(detectTerminalType({ VSCODE_GIT_IPC_HANDLE: 'something' })).toBe(
        TerminalType.VSCode,
      );
    });

    it('should detect iTerm2', () => {
      expect(detectTerminalType({ TERM_PROGRAM: 'iTerm.app' })).toBe(
        TerminalType.ITerm2,
      );
    });

    it('should detect Ghostty', () => {
      expect(detectTerminalType({ TERM_PROGRAM: 'ghostty' })).toBe(
        TerminalType.Ghostty,
      );
      expect(detectTerminalType({ GHOSTTY_BIN_DIR: '/usr/bin' })).toBe(
        TerminalType.Ghostty,
      );
    });

    it('should detect Windows Terminal', () => {
      expect(detectTerminalType({ WT_SESSION: 'guid' })).toBe(
        TerminalType.WindowsTerminal,
      );
    });

    it('should fallback to xterm', () => {
      expect(detectTerminalType({ TERM: 'xterm-256color' })).toBe(
        TerminalType.XTerm,
      );
    });

    it('should return Unknown for unknown environments', () => {
      expect(detectTerminalType({})).toBe(TerminalType.Unknown);
    });
  });
});
