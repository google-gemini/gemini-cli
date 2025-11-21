/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';

export function isJetBrainsTerminal(): boolean {
  return process.env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm';
}

/**
 * Determines if the alternate buffer should be disabled by default based on the environment.
 *
 * Currently disabled for:
 * - JetBrains terminals (scrolling issues)
 * - Windows 10 (legacy console issues)
 * - tmux (rendering artifacts)
 * - Cmder (rendering artifacts)
 */
export function shouldDisableAlternateBufferByDefault(): boolean {
  if (isJetBrainsTerminal()) {
    return true;
  }
  if (process.env['TMUX']) {
    return true;
  }
  if (process.env['CMDER_ROOT']) {
    return true;
  }
  if (process.platform === 'win32') {
    const release = os.release();
    const [major, _, build] = release.split('.').map(Number);

    // Windows 11 starts at build 22000.
    // Windows 10 is major version 10.
    // We disable for Windows 10 (build < 22000) as it often lacks decent VT support in the legacy console.
    if (major === 10 && build < 22000) {
      return true;
    }
  }
  return false;
}
