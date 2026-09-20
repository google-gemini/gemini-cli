/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import { getCachedCpuCompatibility } from '@google/gemini-cli-core';

const ANTIGRAVITY_SH_INSTALL =
  'curl -fsSL https://antigravity.google/cli/install.sh | bash';

export interface AntigravityInstallInfo {
  platformName: string;
  installCmd: string;
}

export interface AntigravityCompatibilityInfo {
  installInfo: AntigravityInstallInfo | null;
  cpuCompatible: boolean;
  incompatibilityReason: string;
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

/**
 * Gets the full Antigravity compatibility info including CPU feature
 * validation. When the CPU lacks required instruction sets (AVX/AVX2),
 * the installInfo is still returned but cpuCompatible is false with a
 * reason string.
 *
 * @see https://github.com/google-gemini/gemini-cli/issues/27342
 */
export function getAntigravityCompatibility(): AntigravityCompatibilityInfo {
  const installInfo = getAntigravityInstallInfo();
  const cpuCompat = getCachedCpuCompatibility();

  let incompatibilityReason = '';

  if (!cpuCompat.compatible) {
    const missing = cpuCompat.missingFeatures.join(', ');
    incompatibilityReason =
      `Your CPU (${cpuCompat.cpuModel}) lacks required instruction sets: ${missing}. ` +
      `Detected microarchitecture: ${cpuCompat.microarchLevel}. ` +
      `The Antigravity CLI requires x86-64-v3 (AVX2) and will crash with ` +
      `"Illegal instruction" (SIGILL, exit code 132) on this hardware.`;
  }

  return {
    installInfo,
    cpuCompatible: cpuCompat.compatible,
    incompatibilityReason,
  };
}
