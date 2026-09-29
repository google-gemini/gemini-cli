/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Storage, normalizePath } from '@google/gemini-cli-core';
import { isTrustLevel, loadTrustedFolders } from '../config/trustedFolders.js';
import type { TrustLevel } from '../config/trustedFolders.js';

export const TRUST_REQUEST_FILENAME = 'trust-request.json';

export interface TrustRequest {
  path: string;
  level: TrustLevel;
}

export function getTrustEnvForSandbox(
  cwd: string,
  folderTrustEnabled: boolean,
): 'true' | 'false' | undefined {
  if (!folderTrustEnabled) {
    return undefined;
  }
  const trusted = loadTrustedFolders().isPathTrusted(cwd);
  if (trusted === undefined) {
    return undefined;
  }
  return trusted ? 'true' : 'false';
}

export async function persistHostTrust(
  folderPath: string,
  level: TrustLevel,
): Promise<void> {
  await loadTrustedFolders().setValue(folderPath, level);
}

export async function writeTrustRequest(
  folderPath: string,
  level: TrustLevel,
): Promise<void> {
  const dir = Storage.getGlobalGeminiDir();
  await fs.mkdir(dir, { recursive: true });
  const request: TrustRequest = {
    path: normalizePath(folderPath),
    level,
  };
  await fs.writeFile(
    path.join(dir, TRUST_REQUEST_FILENAME),
    JSON.stringify(request),
    { encoding: 'utf-8', mode: 0o600 },
  );
}

export async function applyTrustRequestFromSandbox(
  sandboxTmpDir: string,
  workspacePath: string,
): Promise<void> {
  const requestPath = path.join(sandboxTmpDir, TRUST_REQUEST_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(requestPath, 'utf-8');
  } catch {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('path' in parsed) ||
    !('level' in parsed) ||
    typeof parsed.path !== 'string' ||
    !isTrustLevel(parsed.level)
  ) {
    return;
  }

  if (normalizePath(parsed.path) !== normalizePath(workspacePath)) {
    return;
  }

  await persistHostTrust(workspacePath, parsed.level);
}
