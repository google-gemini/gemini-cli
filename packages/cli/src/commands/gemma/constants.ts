/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { Storage } from '@google/gemini-cli-core';

export const LITERT_RELEASE_VERSION = 'v0.9.0-alpha03';
export const LITERT_RELEASE_BASE_URL =
  'https://github.com/google-ai-edge/LiteRT-LM/releases/download';
export const GEMMA_MODEL_NAME = 'gemma3-1b-gpu-custom';
export const DEFAULT_PORT = 9379;
export const HEALTH_CHECK_TIMEOUT_MS = 5000;
export const SERVER_START_WAIT_MS = 3000;

export const PLATFORM_BINARY_MAP: Record<string, string> = {
  'darwin-arm64': 'lit.macos_arm64',
  'linux-x64': 'lit.linux_x86_64',
  'win32-x64': 'lit.windows_x86_64.exe',
};

export function getLiteRtBinDir(): string {
  return path.join(Storage.getGlobalGeminiDir(), 'bin', 'litert');
}

export function getPidFilePath(): string {
  return path.join(Storage.getGlobalTempDir(), 'litert-server.pid');
}

export function getLogFilePath(): string {
  return path.join(Storage.getGlobalTempDir(), 'litert-server.log');
}
