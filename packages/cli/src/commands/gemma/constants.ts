/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { Storage } from '@google/gemini-cli-core';

/** LiteRT-LM release version to download. */
export const LITERT_RELEASE_VERSION = 'v0.9.0-alpha03';

/** Base URL for LiteRT-LM GitHub releases. */
export const LITERT_RELEASE_BASE_URL =
  'https://github.com/google-ai-edge/LiteRT-LM/releases/download';

/** The only tested and supported model for local routing. */
export const GEMMA_MODEL_NAME = 'gemma3-1b-gpu-custom';

/** Default port for the LiteRT-LM server. */
export const DEFAULT_PORT = 9379;

/** Server health check timeout in milliseconds. */
export const HEALTH_CHECK_TIMEOUT_MS = 5000;

/** Delay before checking if server started successfully. */
export const SERVER_START_WAIT_MS = 3000;

/**
 * Maps `${process.platform}-${process.arch}` to the LiteRT-LM binary filename.
 */
export const PLATFORM_BINARY_MAP: Record<string, string> = {
  'darwin-arm64': 'lit.macos_arm64',
  'linux-x64': 'lit.linux_x86_64',
  'win32-x64': 'lit.windows_x86_64.exe',
};

/** Directory where the LiteRT-LM binary is installed. */
export function getLiteRtBinDir(): string {
  return path.join(Storage.getGlobalGeminiDir(), 'bin', 'litert');
}

/** Path to the PID file for the background LiteRT server. */
export function getPidFilePath(): string {
  return path.join(Storage.getGlobalTempDir(), 'litert-server.pid');
}

/** Path to the log file for the background LiteRT server. */
export function getLogFilePath(): string {
  return path.join(Storage.getGlobalTempDir(), 'litert-server.log');
}
