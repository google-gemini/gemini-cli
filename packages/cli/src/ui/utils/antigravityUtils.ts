/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';

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
      installCmd: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    };
  } else if (process.platform === 'linux') {
    return {
      platformName: 'Linux',
      installCmd: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    };
  }
  return null;
}
