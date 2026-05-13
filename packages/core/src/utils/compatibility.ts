/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';

/**
 * Detects if the current OS is Windows 10.
 * Windows 11 also reports as version 10.0, but with build numbers >= 22000.
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

/**
 * Detects if the current terminal is a JetBrains-based IDE terminal.
 */
export function isJetBrainsTerminal(): boolean {
  const env = process.env;
  return !!(
    env['TERMINAL_EMULATOR']?.startsWith('JetBrains') || env['JETBRAINS_IDE']
  );
}

/**
 * Detects if the current terminal is running inside tmux.
 */
export function isTmux(): boolean {
  return !!process.env['TMUX'];
}

/**
 * Detects if the current terminal is running inside GNU screen.
 */
export function isGnuScreen(): boolean {
  return !!process.env['STY'];
}

/**
 * Detects if the terminal is low-color mode (TERM=screen* with no COLORTERM).
 */
export function isLowColorTmux(): boolean {
  const term = process.env['TERM'] || '';
  return isTmux() && term.startsWith('screen') && !process.env['COLORTERM'];
}

/**
 * Detects if the terminal is a "dumb" terminal.
 */
export function isDumbTerminal(): boolean {
  const term = process.env['TERM'] || '';
  return term === 'dumb' || term === 'vt100';
}

/**
 * Detects if the current terminal is the default Apple Terminal.app.
 */
export function isAppleTerminal(): boolean {
  return process.env['TERM_PROGRAM'] === 'Apple_Terminal';
}

/**
 * Detects if the current terminal supports 256 colors (8-bit).
 */
export function supports256Colors(): boolean {
  // Check if stdout supports at least 8-bit color depth
  if (process.stdout.getColorDepth && process.stdout.getColorDepth() >= 8) {
    return true;
  }

  // Check TERM environment variable
  const term = process.env['TERM'] || '';
  if (term.includes('256color')) {
    return true;
  }

  // Terminals supporting true color (like kmscon) also support 256 colors
  if (supportsTrueColor()) {
    return true;
  }

  return false;
}

/**
 * Detects if the current terminal supports true color (24-bit).
 */
export function supportsTrueColor(): boolean {
  // Check COLORTERM environment variable
  if (
    process.env['COLORTERM'] === 'truecolor' ||
    process.env['COLORTERM'] === '24bit' ||
    process.env['COLORTERM'] === 'kmscon'
  ) {
    return true;
  }

  // Check if stdout supports 24-bit color depth
  if (process.stdout.getColorDepth && process.stdout.getColorDepth() >= 24) {
    return true;
  }

  return false;
}

export enum WarningPriority {
  Low = 'low',
  High = 'high',
}

export interface StartupWarning {
  id: string;
  message: string;
  priority: WarningPriority;
}

/**
 * Returns a list of compatibility warnings based on the current environment.
 */
export function getCompatibilityWarnings(options?: {
  isAlternateBuffer?: boolean;
}): StartupWarning[] {
  const warnings: StartupWarning[] = [];

  if (isWindows10()) {
    warnings.push({
      id: 'windows-10',
      message:
        'Warning: Windows 10 detected. Some UI features like smooth scrolling may be degraded. Windows 11 is recommended for the best experience.',
      priority: WarningPriority.High,
    });
  }

  if (isJetBrainsTerminal() && options?.isAlternateBuffer) {
    warnings.push({
      id: 'jetbrains-terminal',
      message:
        'Warning: JetBrains terminal detected — alternate buffer mode may cause scroll wheel issues and rendering artifacts. If you experience problems, disable it in /settings → "Use Alternate Screen Buffer".',
      priority: WarningPriority.High,
    });
  }

  if (isLowColorTmux()) {
    warnings.push({
      id: 'low-color-tmux',
      message:
        'Warning: Limited color support detected (TERM=screen). Some visual elements may not render correctly. For better color support in tmux, add to ~/.tmux.conf:\n      set -g default-terminal "tmux-256color"\n      set -ga terminal-overrides ",*256col*:Tc"',
      priority: WarningPriority.High,
    });
  }

  if (isGnuScreen()) {
    warnings.push({
      id: 'gnu-screen',
      message:
        'Warning: GNU screen detected. Some keyboard shortcuts and visual features may behave unexpectedly. For the best experience, consider using tmux or running Gemini CLI directly in your terminal.',
      priority: WarningPriority.Low,
    });
  }

  if (isDumbTerminal()) {
    const term = process.env['TERM'] || 'dumb';
    warnings.push({
      id: 'dumb-terminal',
      message: `Warning: Basic terminal detected (TERM=${term}). Visual rendering will be limited. For the best experience, use a terminal emulator with truecolor support.`,
      priority: WarningPriority.High,
    });
  }

  if (!supports256Colors()) {
    warnings.push({
      id: '256-color',
      message:
        'Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience.',
      priority: WarningPriority.High,
    });
  } else if (!supportsTrueColor() && !isAppleTerminal()) {
    warnings.push({
      id: 'true-color',
      message:
        'Warning: True color (24-bit) support not detected. Using a terminal with true color enabled will result in a better visual experience.',
      priority: WarningPriority.Low,
    });
  }

  return warnings;
}
