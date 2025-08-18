/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Determines if we should attempt to launch a browser for authentication
 * based on the user's environment.
 *
 * This is an adaptation of the logic from the Google Cloud SDK.
 * @returns True if the tool should attempt to launch a browser.
 */
export function shouldAttemptBrowserLaunch(): boolean {
  // A list of browser names that indicate we should not attempt to open a
  // web browser for the user.
  const browserBlocklist = ['www-browser'];
  const browserEnv = process.env['BROWSER'];
  if (browserEnv && browserBlocklist.includes(browserEnv)) {
    return false;
  }
  // Common environment variables used in CI/CD or other non-interactive shells.
  if (
    process.env['CI'] ||
    process.env['DEBIAN_FRONTEND'] === 'noninteractive'
  ) {
    return false;
  }

  // The presence of SSH_CONNECTION indicates a remote session.
  // We should not attempt to launch a browser unless a display is explicitly available
  // (checked below for Linux).
  const isSSH = !!process.env['SSH_CONNECTION'];

  // On Linux, the presence of a display server is a strong indicator of a GUI.
  if (process.platform === 'linux') {
    // These are environment variables that can indicate a running compositor on
    // Linux.
    const displayVariables = ['DISPLAY', 'WAYLAND_DISPLAY', 'MIR_SOCKET'];
    const hasDisplay = displayVariables.some((v) => !!process.env[v]);
    if (!hasDisplay) {
      return false;
    }
  }

  // If in an SSH session on a non-Linux OS (e.g., macOS), don't launch browser.
  // The Linux case is handled above (it's allowed if DISPLAY is set).
  if (isSSH && process.platform !== 'linux') {
    return false;
  }

  // For non-Linux OSes, we generally assume a GUI is available
  // unless other signals (like SSH) suggest otherwise.
  // The `open` command's error handling will catch final edge cases.
  return true;
}
