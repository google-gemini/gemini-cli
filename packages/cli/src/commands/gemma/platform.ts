/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

/**
 * Detects the current platform and resolves the corresponding LiteRT-LM binary name.
 * Returns null if the platform is unsupported.
 */
export function detectPlatform(): PlatformInfo | null {
  const key = `${process.platform}-${process.arch}`;
  const binaryName = PLATFORM_BINARY_MAP[key];
  if (!binaryName) {
    return null;
  }
  return { key, binaryName };
}

/** Returns the full local path to the LiteRT-LM binary. */
export function getBinaryPath(binaryName?: string): string | null {
  const name = binaryName ?? detectPlatform()?.binaryName;
  if (!name) return null;
  return path.join(getLiteRtBinDir(), name);
}

/** Returns the GitHub release download URL for the binary. */
export function getBinaryDownloadUrl(binaryName: string): string {
  return `${LITERT_RELEASE_BASE_URL}/${LITERT_RELEASE_VERSION}/${binaryName}`;
}

/** Checks if the LiteRT-LM binary exists on disk. */
export function isBinaryInstalled(): boolean {
  const binaryPath = getBinaryPath();
  if (!binaryPath) return false;
  return fs.existsSync(binaryPath);
}

/**
 * Checks if the Gemma model has been downloaded by running `lit list`
 * and looking for the model name in stdout.
 */
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

/**
 * Checks if a LiteRT-LM server is running and responding on the given port.
 * Uses a simple HTTP request with a short timeout.
 */
export async function isServerRunning(port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HEALTH_CHECK_TIMEOUT_MS,
    );
    const response = await fetch(`http://localhost:${port}/`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // Any response (even an error page) means the server is up.
    return response.ok || response.status > 0;
  } catch {
    return false;
  }
}

/**
 * Reads the PID from the PID file, if it exists.
 * Returns the PID number, or null if the file doesn't exist or is invalid.
 */
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

/**
 * Checks if a process with the given PID is still running.
 */
export function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if the process exists without actually signaling it.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
