/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';

/**
 * Known terminal types that Gemini CLI recognizes for specialized behavior.
 */
export enum TerminalType {
  Unknown = 'unknown',
  JetBrains = 'jetbrains',
  Tmux = 'tmux',
  VSCode = 'vscode',
  ITerm2 = 'iterm2',
  Ghostty = 'ghostty',
  AppleTerminal = 'apple_terminal',
  WindowsTerminal = 'windows_terminal',
  XTerm = 'xterm',
}

/**
 * Detects the current terminal type based on environment variables.
 */
export function detectTerminalType(
  env: NodeJS.ProcessEnv = process.env,
): TerminalType {
  if (
    env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm' ||
    env['TERM_PROGRAM'] === 'JetBrains-JediTerm' ||
    !!env['IDEA_INITIAL_DIRECTORY'] ||
    !!env['JETBRAINS_IDE']
  ) {
    return TerminalType.JetBrains;
  }

  if (!!env['TMUX'] || (env['TERM'] || '').includes('tmux')) {
    return TerminalType.Tmux;
  }

  if (env['TERM_PROGRAM'] === 'vscode' || !!env['VSCODE_GIT_IPC_HANDLE']) {
    return TerminalType.VSCode;
  }

  if (env['TERM_PROGRAM'] === 'iTerm.app') {
    return TerminalType.ITerm2;
  }

  if (env['TERM_PROGRAM'] === 'ghostty' || !!env['GHOSTTY_BIN_DIR']) {
    return TerminalType.Ghostty;
  }

  if (env['TERM_PROGRAM'] === 'Apple_Terminal') {
    return TerminalType.AppleTerminal;
  }

  if (env['WT_SESSION']) {
    return TerminalType.WindowsTerminal;
  }

  if ((env['TERM'] || '').includes('xterm')) {
    return TerminalType.XTerm;
  }

  return TerminalType.Unknown;
}

/**
 * Detects if the current OS is Windows 10.
 */
export function isWindows10(): boolean {
  if (os.platform() !== 'win32') {
    return false;
  }
  const release = os.release();
  const parts = release.split('.');
  if (parts.length >= 3 && parts[0] === '10' && parts[1] === '0') {
    const build = parseInt(parts[2], 10);
    return build < 22000;
  }
  return false;
}
