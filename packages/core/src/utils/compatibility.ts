/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'node:os';
import {
  detectTerminalEnvironment,
  type TerminalEnvironment,
} from './terminalEnvironment.js';

export enum WarningPriority {
  Low = 'low',
  Medium = 'medium',
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
  termEnv?: TerminalEnvironment;
}): StartupWarning[] {
  const warnings: StartupWarning[] = [];
  const env = options?.termEnv ?? detectTerminalEnvironment();

  if (env.isWindows10) {
    warnings.push({
      id: 'windows-10',
      message:
        'Warning: Windows 10 detected. Some UI features like smooth scrolling may be degraded. Windows 11 is recommended for the best experience.',
      priority: WarningPriority.High,
    });
  }

  // JetBrains alt-buffer bug warning
  if (env.isJetBrains && options?.isAlternateBuffer) {
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

  if (!env.supports256Colors) {
    warnings.push({
      id: '256-color',
      message:
        'Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience.',
      priority: WarningPriority.High,
    });
  } else if (
    !env.supportsTrueColor &&
    !env.isITerm2 &&
    !env.isVSCode &&
    !env.isGhostty &&
    !env.isAppleTerminal
  ) {
    warnings.push({
      id: 'true-color',
      message:
        'Warning: True color (24-bit) support not detected. Using a terminal with true color enabled will result in a better visual experience.',
      priority: WarningPriority.Low,
    });
  }

  return warnings;
}
