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
export const LITERT_API_VERSION = 'v1beta';
export const SERVER_START_WAIT_MS = 3000;

export const PLATFORM_BINARY_MAP: Record<string, string> = {
  'darwin-arm64': 'lit.macos_arm64',
  'linux-x64': 'lit.linux_x86_64',
  'win32-x64': 'lit.windows_x86_64.exe',
};

// SHA-256 hashes for the official LiteRT-LM v0.9.0-alpha03 release binaries.
export const PLATFORM_BINARY_SHA256: Record<string, string> = {
  'lit.macos_arm64':
    '9e826a2634f2e8b220ad0f1e1b5c139e0b47cb172326e3b7d46d31382f49478e',
  'lit.linux_x86_64':
    '66601df8a07f08244b188e9fcab0bf4a16562fe76d8d47e49f40273d57541ee8',
  'lit.windows_x86_64.exe':
    'de82d2829d2fb1cbdb318e2d8a78dc2f9659ff14cb11b2894d1f30e0bfde2bf6',
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
