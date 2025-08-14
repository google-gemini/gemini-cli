/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';

/**
 * Detects VS Code in TMUX environment using multiple approaches
 */
export function detectVsCode(): boolean {
  // Quick check first - most common case
  if (process.env.TERM_PROGRAM === 'vscode') {
    return true;
  }

  // TMUX-specific detection
  if (process.env.TMUX) {
    return detectVsCodeInTmux();
  }

  return false;
}

/**
 * VS Code detection specifically for TMUX sessions
 */
function detectVsCodeInTmux(): boolean {
  try {
    // Primary method: Check TMUX global environment for original TERM_PROGRAM
    const output = execSync('tmux show-environment -g | grep TERM_PROGRAM=', {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return output.includes('TERM_PROGRAM=vscode');
  } catch {
    return false;
  }
}
