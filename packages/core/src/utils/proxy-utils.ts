/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import os from 'node:os';

/**
 * Interface representing proxy configuration.
 */
export interface ProxyConfig {
  /** The proxy server URL (e.g., http://proxy.example.com:8080). */
  proxyUrl: string;
  /** Whether the proxy was discovered automatically from system settings. */
  isAutoDiscovered: boolean;
}

/**
 * Attempts to detect the system proxy settings on Windows.
 * It checks the registry for Internet Settings and falls back to WinHTTP settings.
 *
 * @returns A ProxyConfig object if a proxy is found, otherwise null.
 */
export function detectWindowsProxy(): ProxyConfig | null {
  if (os.platform() !== 'win32') {
    return null;
  }

  try {
    // 1. Check User Internet Settings via registry
    // ProxyEnable = 1 means proxy is enabled
    // ProxyServer = "server:port"
    // AutoConfigURL = "http://path/to/proxy.pac" (not yet supported by undici ProxyAgent)
    const registryCmd =
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"';
    const registryOutput = execSync(registryCmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const proxyEnableMatch = registryOutput.match(
      /ProxyEnable\s+REG_DWORD\s+0x1/,
    );
    const proxyServerMatch = registryOutput.match(
      /ProxyServer\s+REG_SZ\s+([^\s\r\n]+)/,
    );

    if (proxyEnableMatch && proxyServerMatch) {
      let proxyUrl = proxyServerMatch[1];
      if (!proxyUrl.includes('://')) {
        proxyUrl = `http://${proxyUrl}`;
      }
      return { proxyUrl, isAutoDiscovered: true };
    }

    // 2. Fallback to WinHTTP settings (often set by netsh or Group Policy)
    const winHttpCmd = 'netsh winhttp show proxy';
    const winHttpOutput = execSync(winHttpCmd, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    // Example: "Proxy Server(s) :  http://proxy.example.com:8080"
    const winHttpMatch = winHttpOutput.match(
      /Proxy Server\(s\)\s+:\s+([^\s\r\n]+)/,
    );
    if (winHttpMatch && !winHttpOutput.includes('Direct access')) {
      let proxyUrl = winHttpMatch[1];
      if (!proxyUrl.includes('://')) {
        proxyUrl = `http://${proxyUrl}`;
      }
      return { proxyUrl, isAutoDiscovered: true };
    }
  } catch {
    // Ignore errors in proxy detection
  }

  return null;
}

/**
 * Detects the system proxy for the current platform.
 * Currently only implements Windows-specific logic.
 *
 * @returns A ProxyConfig object if a proxy is found, otherwise null.
 */
export function detectSystemProxy(): ProxyConfig | null {
  if (os.platform() === 'win32') {
    return detectWindowsProxy();
  }
  // TODO: Implement for macOS (networksetup) and Linux (env vars)
  return null;
}
