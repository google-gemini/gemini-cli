/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { Storage, normalizePath } from '@google/gemini-cli-core';
import {
  TrustLevel,
  resetTrustedFoldersForTesting,
  loadTrustedFolders,
} from '../config/trustedFolders.js';
import {
  TRUST_REQUEST_FILENAME,
  getTrustEnvForSandbox,
  persistHostTrust,
  writeTrustRequest,
  applyTrustRequestFromSandbox,
} from './sandboxTrust.js';

describe('sandboxTrust', () => {
  let tempDir: string;
  let trustedFoldersPath: string;
  let globalGeminiDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-trust-test-'));
    trustedFoldersPath = path.join(tempDir, 'trustedFolders.json');
    globalGeminiDir = path.join(tempDir, 'gemini-dir');
    fs.mkdirSync(globalGeminiDir, { recursive: true });

    vi.stubEnv('GEMINI_CLI_TRUSTED_FOLDERS_PATH', trustedFoldersPath);
    vi.spyOn(Storage, 'getGlobalGeminiDir').mockReturnValue(globalGeminiDir);
    resetTrustedFoldersForTesting();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getTrustEnvForSandbox', () => {
    it('returns undefined when folder trust is disabled', async () => {
      await persistHostTrust(tempDir, TrustLevel.TRUST_FOLDER);
      resetTrustedFoldersForTesting();
      expect(getTrustEnvForSandbox(tempDir, false)).toBeUndefined();
    });

    it('returns true when the path is trusted', async () => {
      await persistHostTrust(tempDir, TrustLevel.TRUST_FOLDER);
      resetTrustedFoldersForTesting();
      expect(getTrustEnvForSandbox(tempDir, true)).toBe('true');
    });

    it('returns true when a parent is trusted', async () => {
      await persistHostTrust(tempDir, TrustLevel.TRUST_PARENT);
      resetTrustedFoldersForTesting();
      expect(getTrustEnvForSandbox(tempDir, true)).toBe('true');
    });

    it('returns false when the path is explicitly untrusted', async () => {
      await persistHostTrust(tempDir, TrustLevel.DO_NOT_TRUST);
      resetTrustedFoldersForTesting();
      expect(getTrustEnvForSandbox(tempDir, true)).toBe('false');
    });

    it('returns undefined when the path has never been decided', () => {
      expect(getTrustEnvForSandbox(tempDir, true)).toBeUndefined();
    });
  });

  describe('writeTrustRequest / applyTrustRequestFromSandbox', () => {
    it('persists a matching trust request onto the host', async () => {
      await writeTrustRequest(tempDir, TrustLevel.TRUST_FOLDER);
      await applyTrustRequestFromSandbox(globalGeminiDir, tempDir);

      resetTrustedFoldersForTesting();
      expect(loadTrustedFolders().user.config[normalizePath(tempDir)]).toBe(
        TrustLevel.TRUST_FOLDER,
      );
    });

    it('is a no-op when the request file is missing', async () => {
      await applyTrustRequestFromSandbox(globalGeminiDir, tempDir);
      resetTrustedFoldersForTesting();
      expect(loadTrustedFolders().user.config).toEqual({});
    });

    it('is a no-op when the request JSON is malformed', async () => {
      await fsp.writeFile(
        path.join(globalGeminiDir, TRUST_REQUEST_FILENAME),
        '{not-json',
      );
      await applyTrustRequestFromSandbox(globalGeminiDir, tempDir);
      resetTrustedFoldersForTesting();
      expect(loadTrustedFolders().user.config).toEqual({});
    });

    it('is a no-op when the trust level is invalid', async () => {
      await fsp.writeFile(
        path.join(globalGeminiDir, TRUST_REQUEST_FILENAME),
        JSON.stringify({ path: normalizePath(tempDir), level: 'NOPE' }),
      );
      await applyTrustRequestFromSandbox(globalGeminiDir, tempDir);
      resetTrustedFoldersForTesting();
      expect(loadTrustedFolders().user.config).toEqual({});
    });

    it('is a no-op when the request path does not match the workspace', async () => {
      await writeTrustRequest('/some/other/path', TrustLevel.TRUST_FOLDER);
      await applyTrustRequestFromSandbox(globalGeminiDir, tempDir);
      resetTrustedFoldersForTesting();
      expect(loadTrustedFolders().user.config).toEqual({});
    });
  });

  it('persistHostTrust writes the trust level', async () => {
    await persistHostTrust(tempDir, TrustLevel.TRUST_PARENT);
    const saved = JSON.parse(fs.readFileSync(trustedFoldersPath, 'utf-8')) as {
      [key: string]: string;
    };
    expect(saved[normalizePath(tempDir)]).toBe(TrustLevel.TRUST_PARENT);
  });
});
