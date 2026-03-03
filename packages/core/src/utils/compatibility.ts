/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import {
  TerminalType,
  detectTerminalType,
  isWindows10 as detectIsWindows10,
} from './terminalEnvironment.js';

/**
 * Detects if the current OS is Windows 10.
 */
// Removed duplicate export to avoid ambiguity in index.ts

/**
 * Detects if the current terminal is a JetBrains-based IDE terminal.
 */
export function isJetBrainsTerminal(): boolean {
  return detectTerminalType() === TerminalType.JetBrains;
}

/**
 * Detects if the current terminal is the default Apple Terminal.app.
 */
export function isAppleTerminal(): boolean {
  return detectTerminalType() === TerminalType.AppleTerminal;
}

/**
 * Detects if the current terminal is VS Code.
 */
export function isVSCode(): boolean {
  return detectTerminalType() === TerminalType.VSCode;
}

/**
 * Detects if the current terminal is iTerm2.
 */
export function isITerm2(): boolean {
  return detectTerminalType() === TerminalType.ITerm2;
}

/**
 * Detects if the current terminal is Ghostty.
 */
export function isGhostty(): boolean {
  return detectTerminalType() === TerminalType.Ghostty;
}

/**
 * Detects if running inside tmux.
 */
export function isTmux(): boolean {
  return detectTerminalType() === TerminalType.Tmux;
}

/**
 * Detects if the current terminal is Windows Terminal.
 */
export function isWindowsTerminal(): boolean {
  return detectTerminalType() === TerminalType.WindowsTerminal;
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

  return false;
}

/**
 * Detects if the current terminal supports true color (24-bit).
 */
export function supportsTrueColor(): boolean {
  // Check COLORTERM environment variable
  if (
    process.env['COLORTERM'] === 'truecolor' ||
    process.env['COLORTERM'] === '24bit'
  ) {
    return true;
  }

  // Check if stdout supports 24-bit color depth
  if (process.stdout.getColorDepth && process.stdout.getColorDepth() >= 24) {
    return true;
  }

  return false;
}

/**
 * Heuristic for keyboard protocol support based on terminal identity.
 */
export function supportsKeyboardProtocolHeuristic(): boolean {
  const type = detectTerminalType();
  return (
    type === TerminalType.Ghostty ||
    type === TerminalType.ITerm2 ||
    type === TerminalType.VSCode ||
    type === TerminalType.WindowsTerminal
  );
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
  supportsKeyboardProtocol?: boolean;
}): StartupWarning[] {
  const warnings: StartupWarning[] = [];
  const type = detectTerminalType();

  if (detectIsWindows10()) {
    warnings.push({
      id: 'windows-10',
      message:
        'Warning: Windows 10 detected. Some UI features like smooth scrolling may be degraded. Windows 11 is recommended for the best experience.',
      priority: WarningPriority.High,
    });
  }

  if (type === TerminalType.JetBrains && options?.isAlternateBuffer) {
    const platformTerminals: Partial<Record<NodeJS.Platform, string>> = {
      win32: 'Windows Terminal',
      darwin: 'iTerm2 or Ghostty',
      linux: 'Ghostty',
    };
    const suggestion = platformTerminals[os.platform()];
    const suggestedTerminals = suggestion ? ` (e.g., ${suggestion})` : '';

    warnings.push({
      id: 'jetbrains-terminal',
      message: `Warning: JetBrains mouse scrolling is unreliable with alternate buffer enabled. Using an external terminal${suggestedTerminals} or disabling alternate buffer in settings is recommended.`,
      priority: WarningPriority.High,
    });
  }

  if (type === TerminalType.Tmux) {
    warnings.push({
      id: 'tmux-mouse-support',
      message:
        'Warning: Running inside tmux. For the best experience (including mouse scrolling), ensure "set -g mouse on" is enabled in your tmux configuration.',
      priority: WarningPriority.Low,
    });
  }

  if (!supports256Colors()) {
    warnings.push({
      id: '256-color',
      message:
        'Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience.',
      priority: WarningPriority.High,
    });
  } else if (
    !supportsTrueColor() &&
    type !== TerminalType.ITerm2 &&
    type !== TerminalType.VSCode &&
    type !== TerminalType.Ghostty &&
    type !== TerminalType.AppleTerminal
  ) {
    warnings.push({
      id: 'true-color',
      message:
        'Warning: True color (24-bit) support not detected. Using a terminal with true color enabled will result in a better visual experience.',
      priority: WarningPriority.Low,
    });
  }

  const hasKeyboardProtocol =
    options?.supportsKeyboardProtocol ?? supportsKeyboardProtocolHeuristic();

  if (!hasKeyboardProtocol) {
    const suggestion =
      os.platform() === 'darwin'
        ? 'iTerm2 or Ghostty'
        : os.platform() === 'win32'
          ? 'Windows Terminal'
          : 'Ghostty';

    warnings.push({
      id: 'keyboard-protocol',
      message: `Warning: Advanced keyboard features (like Shift+Enter for newlines) are not supported in this terminal. Consider using ${suggestion} for a better experience.`,
      priority: WarningPriority.Low,
    });
  }

  return warnings;
}
