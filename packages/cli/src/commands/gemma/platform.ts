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
  LITERT_API_VERSION,
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

export interface LiteRtServerProcessInfo {
  pid: number;
  binaryPath?: string;
  port?: number;
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
    const response = await fetch(
      `http://localhost:${port}/${LITERT_API_VERSION}/models/${GEMMA_MODEL_NAME}:generateContent`,
      { method: 'POST', signal: controller.signal },
    );
    clearTimeout(timeout);
    // A 400 (bad request) confirms the route exists — the server recognises
    // the model endpoint.  Only a 404 means "wrong server / wrong model".
    return response.status !== 404;
  } catch {
    return false;
  }
}

function isLiteRtServerProcessInfo(
  value: unknown,
): value is LiteRtServerProcessInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const isPositiveInteger = (candidate: unknown): candidate is number =>
    typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate > 0;
  const isNonEmptyString = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && candidate.length > 0;

  const pid: unknown = Object.getOwnPropertyDescriptor(value, 'pid')?.value;
  if (!isPositiveInteger(pid)) {
    return false;
  }

  const binaryPath: unknown = Object.getOwnPropertyDescriptor(
    value,
    'binaryPath',
  )?.value;
  if (binaryPath !== undefined && !isNonEmptyString(binaryPath)) {
    return false;
  }

  const port: unknown = Object.getOwnPropertyDescriptor(value, 'port')?.value;
  if (port !== undefined && !isPositiveInteger(port)) {
    return false;
  }

  return true;
}

export function readServerProcessInfo(): LiteRtServerProcessInfo | null {
  const pidPath = getPidFilePath();
  try {
    const content = fs.readFileSync(pidPath, 'utf-8').trim();
    if (!content) {
      return null;
    }

    if (/^\d+$/.test(content)) {
      return { pid: parseInt(content, 10) };
    }

    const parsed = JSON.parse(content) as unknown;
    return isLiteRtServerProcessInfo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeServerProcessInfo(
  processInfo: LiteRtServerProcessInfo,
): void {
  fs.writeFileSync(getPidFilePath(), JSON.stringify(processInfo), 'utf-8');
}

export function readServerPid(): number | null {
  return readServerProcessInfo()?.pid ?? null;
}

function normalizeProcessValue(value: string): string {
  const normalized = value.replace(/\0/g, ' ').trim();
  if (process.platform === 'win32') {
    return normalized.replace(/\\/g, '/').replace(/\s+/g, ' ').toLowerCase();
  }
  return normalized.replace(/\s+/g, ' ');
}

function readProcessCommandLine(pid: number): string | null {
  try {
    if (process.platform === 'linux') {
      const output = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf-8');
      return output.trim() ? output : null;
    }

    if (process.platform === 'win32') {
      const output = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
        ],
        {
          encoding: 'utf-8',
          timeout: 5000,
        },
      );
      return output.trim() || null;
    }

    const output = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return output.trim() || null;
  } catch {
    return null;
  }
}

export function isExpectedLiteRtServerCommand(
  commandLine: string,
  options: {
    binaryPath?: string | null;
    port?: number;
  },
): boolean {
  const normalizedCommandLine = normalizeProcessValue(commandLine);
  if (!normalizedCommandLine) {
    return false;
  }

  if (!/(^|\s|")serve(\s|$)/.test(normalizedCommandLine)) {
    return false;
  }

  if (
    options.port !== undefined &&
    !normalizedCommandLine.includes(`--port=${options.port}`)
  ) {
    return false;
  }

  if (!options.binaryPath) {
    return true;
  }

  const normalizedBinaryPath = normalizeProcessValue(options.binaryPath);
  const normalizedBinaryName = normalizeProcessValue(
    path.basename(options.binaryPath),
  );
  return (
    normalizedCommandLine.includes(normalizedBinaryPath) ||
    normalizedCommandLine.includes(normalizedBinaryName)
  );
}

export function isExpectedLiteRtServerProcess(
  pid: number,
  options: {
    binaryPath?: string | null;
    port?: number;
  },
): boolean {
  const commandLine = readProcessCommandLine(pid);
  if (!commandLine) {
    return false;
  }
  return isExpectedLiteRtServerCommand(commandLine, options);
}

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
