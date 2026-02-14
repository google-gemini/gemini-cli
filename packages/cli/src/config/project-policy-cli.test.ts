/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';
import { loadCliConfig, type CliArgs } from './config.js';
import { createTestMergedSettings } from './settings.js';
import * as ServerConfig from '@google/gemini-cli-core';
import { isWorkspaceTrusted } from './trustedFolders.js';

// Mock dependencies
vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual<typeof ServerConfig>(
    '@google/gemini-cli-core',
  );
  return {
    ...actual,
    loadServerHierarchicalMemory: vi.fn().mockResolvedValue({
      memoryContent: '',
      fileCount: 0,
      filePaths: [],
    }),
    createPolicyEngineConfig: vi.fn().mockResolvedValue({
      rules: [],
      checkers: [],
    }),
    getVersion: vi.fn().mockResolvedValue('test-version'),
    PolicyIntegrityManager: vi.fn().mockImplementation(() => ({
      checkIntegrity: vi.fn().mockResolvedValue({
        status: 'match', // IntegrityStatus.MATCH
        hash: 'test-hash',
        fileCount: 1,
      }),
    })),
    IntegrityStatus: { MATCH: 'match', NEW: 'new', MISMATCH: 'mismatch' },
  };
});

describe('Project-Level Policy CLI Integration', () => {
  const MOCK_CWD = process.cwd();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have getProjectPoliciesDir on Storage class', () => {
    const storage = new ServerConfig.Storage(MOCK_CWD);
    expect(storage.getProjectPoliciesDir).toBeDefined();
    expect(typeof storage.getProjectPoliciesDir).toBe('function');
  });

  it('should pass projectPoliciesDir to createPolicyEngineConfig when folder is trusted', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });

    const settings = createTestMergedSettings();
    const argv = { query: 'test' } as unknown as CliArgs;

    await loadCliConfig(settings, 'test-session', argv, { cwd: MOCK_CWD });

    // The wrapper createPolicyEngineConfig in policy.ts calls createCorePolicyEngineConfig
    // We check if the core one was called with 4 arguments, the 4th being the project dir
    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined, // defaultPoliciesDir
      expect.stringContaining(path.join('.gemini', 'policies')),
    );
  });

  it('should NOT pass projectPoliciesDir to createPolicyEngineConfig when folder is NOT trusted', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });

    const settings = createTestMergedSettings();
    const argv = { query: 'test' } as unknown as CliArgs;

    await loadCliConfig(settings, 'test-session', argv, { cwd: MOCK_CWD });

    // The 4th argument (projectPoliciesDir) should be undefined
    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      undefined,
    );
  });
});
