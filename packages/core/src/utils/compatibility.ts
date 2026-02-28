/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  detectTerminalEnvironment,
  getTerminalWarnings,
  type TerminalEnvironment,
  type StartupWarning,
  WarningPriority,
} from './terminalEnvironment.js';

export { WarningPriority, type StartupWarning };

/**
 * Returns a list of compatibility warnings based on the current environment.
 */
export function getCompatibilityWarnings(options?: {
  isAlternateBuffer?: boolean;
  termEnv?: TerminalEnvironment;
}): StartupWarning[] {
  const env = options?.termEnv ?? detectTerminalEnvironment();
  return getTerminalWarnings(env, {
    isAlternateBuffer: options?.isAlternateBuffer,
  });
}
