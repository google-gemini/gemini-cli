/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

const ANTIGRAVITY_SH_INSTALL =
  'curl -fsSL https://antigravity.google/cli/install.sh | bash';

export interface AntigravityInstallInfo {
  platformName: string;
  installCmd: string;
}

/**
 * Gets the platform-specific installation details for the Antigravity CLI.
 * Returns null if the current platform is unsupported.
 */
export function getAntigravityInstallInfo(): AntigravityInstallInfo | null {
  if (process.platform === 'win32') {
    if (process.env['PSModulePath']) {
      return {
        platformName: 'Windows (PowerShell)',
        installCmd: 'irm https://antigravity.google/cli/install.ps1 | iex',
      };
    } else {
      return {
        platformName: 'Windows (Command Prompt)',
        installCmd:
          'curl -fsSL https://antigravity.google/cli/install.cmd -o install.cmd && install.cmd && del install.cmd',
      };
    }
  } else if (process.platform === 'darwin') {
    return {
      platformName: 'macOS',
      installCmd: ANTIGRAVITY_SH_INSTALL,
    };
  } else if (process.platform === 'linux') {
    return {
      platformName: 'Linux',
      installCmd: ANTIGRAVITY_SH_INSTALL,
    };
  }
  return null;
}
