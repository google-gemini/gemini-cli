/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadSettings, SettingScope } from '../../config/settings.js';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  PLATFORM_BINARY_MAP,
  LITERT_RELEASE_BASE_URL,
  LITERT_RELEASE_VERSION,
  getLiteRtBinDir,
  GEMMA_MODEL_NAME,
  HEALTH_CHECK_TIMEOUT_MS,
  getPidFilePath,
} from './constants.js';

export interface PlatformInfo {
  key: string;
  binaryName: string;
}

export interface GemmaConfigStatus {
  settingsEnabled: boolean;
  configuredPort: number;
  configuredBinaryPath?: string;
}

function getUserConfiguredBinaryPath(
  workspaceDir = process.cwd(),
): string | undefined {
  try {
    const userGemmaSettings = loadSettings(workspaceDir).forScope(
      SettingScope.User,
    ).settings.experimental?.gemmaModelRouter;
    return userGemmaSettings?.binaryPath?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function parsePortFromHost(
  host: string | undefined,
  fallbackPort: number,
): number {
  if (!host) {
    return fallbackPort;
  }

  try {
    const url = new URL(host);
    const port = Number(url.port);
    return Number.isFinite(port) && port > 0 ? port : fallbackPort;
  } catch {
    const match = host.match(/:(\d+)/);
    if (!match) {
      return fallbackPort;
    }
    const port = parseInt(match[1], 10);
    return Number.isFinite(port) && port > 0 ? port : fallbackPort;
  }
}

export function resolveGemmaConfig(fallbackPort: number): GemmaConfigStatus {
  let settingsEnabled = false;
  let configuredPort = fallbackPort;
  const configuredBinaryPath = getUserConfiguredBinaryPath();
  try {
    const settings = loadSettings(process.cwd());
    const gemmaSettings = settings.merged.experimental?.gemmaModelRouter;
    settingsEnabled = gemmaSettings?.enabled === true;
    configuredPort = parsePortFromHost(
      gemmaSettings?.classifier?.host,
      fallbackPort,
    );
  } catch {
    // ignore — settings may fail to load outside a workspace
  }
  return { settingsEnabled, configuredPort, configuredBinaryPath };
}

export function detectPlatform(): PlatformInfo | null {
  const key = `${process.platform}-${process.arch}`;
  const binaryName = PLATFORM_BINARY_MAP[key];
  if (!binaryName) {
    return null;
  }
  return { key, binaryName };
}

export function getBinaryPath(binaryName?: string): string | null {
  const configuredBinaryPath = getUserConfiguredBinaryPath();
  if (configuredBinaryPath) {
    return configuredBinaryPath;
  }

  const name = binaryName ?? detectPlatform()?.binaryName;
  if (!name) return null;
  return path.join(getLiteRtBinDir(), name);
}

export function getBinaryDownloadUrl(binaryName: string): string {
  return `${LITERT_RELEASE_BASE_URL}/${LITERT_RELEASE_VERSION}/${binaryName}`;
}

export function isBinaryInstalled(binaryPath = getBinaryPath()): boolean {
  if (!binaryPath) return false;
  return fs.existsSync(binaryPath);
}

export function isModelDownloaded(binaryPath: string): boolean {
  try {
    const output = execFileSync(binaryPath, ['list'], {
      encoding: 'utf-8',
      timeout: 10000,
    });
    return output.includes(GEMMA_MODEL_NAME);
  } catch {
    return false;
  }
}

export async function isServerRunning(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HEALTH_CHECK_TIMEOUT_MS,
    );
    await fetch(`http://localhost:${port}/`, { signal: controller.signal });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

export function readServerPid(): number | null {
  const pidPath = getPidFilePath();
  try {
    const content = fs.readFileSync(pidPath, 'utf-8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
