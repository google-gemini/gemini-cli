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

const mockCheckIntegrity = vi.fn();
const mockAcceptIntegrity = vi.fn();

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
      checkIntegrity: mockCheckIntegrity,
      acceptIntegrity: mockAcceptIntegrity,
    })),
    IntegrityStatus: { MATCH: 'match', NEW: 'new', MISMATCH: 'mismatch' },
    debugLogger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
    isHeadlessMode: vi.fn().mockReturnValue(false), // Default to interactive
  };
});

describe('Workspace-Level Policy CLI Integration', () => {
  const MOCK_CWD = process.cwd();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default to MATCH for existing tests
    mockCheckIntegrity.mockResolvedValue({
      status: 'match',
      hash: 'test-hash',
      fileCount: 1,
    });
    vi.mocked(ServerConfig.isHeadlessMode).mockReturnValue(false);
  });

  it('should have getWorkspacePoliciesDir on Storage class', () => {
    const storage = new ServerConfig.Storage(MOCK_CWD);
    expect(storage.getWorkspacePoliciesDir).toBeDefined();
    expect(typeof storage.getWorkspacePoliciesDir).toBe('function');
  });

  it('should pass workspacePoliciesDir to createPolicyEngineConfig when folder is trusted', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });

    const settings = createTestMergedSettings();
    const argv = { query: 'test' } as unknown as CliArgs;

    await loadCliConfig(settings, 'test-session', argv, { cwd: MOCK_CWD });

    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePoliciesDir: expect.stringContaining(
          path.join('.gemini', 'policies'),
        ),
      }),
      expect.anything(),
    );
  });

  it('should NOT pass workspacePoliciesDir to createPolicyEngineConfig when folder is NOT trusted', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: false,
      source: 'file',
    });

    const settings = createTestMergedSettings();
    const argv = { query: 'test' } as unknown as CliArgs;

    await loadCliConfig(settings, 'test-session', argv, { cwd: MOCK_CWD });

    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePoliciesDir: undefined,
      }),
      expect.anything(),
    );
  });

  it('should NOT pass workspacePoliciesDir if integrity is NEW but fileCount is 0', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
    mockCheckIntegrity.mockResolvedValue({
      status: 'new',
      hash: 'hash',
      fileCount: 0,
    });

    const settings = createTestMergedSettings();
    const argv = { query: 'test' } as unknown as CliArgs;

    await loadCliConfig(settings, 'test-session', argv, { cwd: MOCK_CWD });

    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePoliciesDir: undefined,
      }),
      expect.anything(),
    );
  });

  it('should automatically accept and load workspacePoliciesDir if integrity MISMATCH in non-interactive mode', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
    mockCheckIntegrity.mockResolvedValue({
      status: 'mismatch',
      hash: 'new-hash',
      fileCount: 1,
    });
    vi.mocked(ServerConfig.isHeadlessMode).mockReturnValue(true); // Non-interactive

    const settings = createTestMergedSettings();
    const argv = { prompt: 'do something' } as unknown as CliArgs;

    await loadCliConfig(settings, 'test-session', argv, { cwd: MOCK_CWD });

    expect(mockAcceptIntegrity).toHaveBeenCalledWith(
      'workspace',
      MOCK_CWD,
      'new-hash',
    );
    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePoliciesDir: expect.stringContaining(
          path.join('.gemini', 'policies'),
        ),
      }),
      expect.anything(),
    );
  });

  it('should set policyUpdateConfirmationRequest if integrity MISMATCH in interactive mode', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
    mockCheckIntegrity.mockResolvedValue({
      status: 'mismatch',
      hash: 'new-hash',
      fileCount: 1,
    });
    vi.mocked(ServerConfig.isHeadlessMode).mockReturnValue(false); // Interactive

    const settings = createTestMergedSettings();
    const argv = {
      query: 'test',
      promptInteractive: 'test',
    } as unknown as CliArgs;

    const config = await loadCliConfig(settings, 'test-session', argv, {
      cwd: MOCK_CWD,
    });

    expect(config.getPolicyUpdateConfirmationRequest()).toEqual({
      scope: 'workspace',
      identifier: MOCK_CWD,
      policyDir: expect.stringContaining(path.join('.gemini', 'policies')),
      newHash: 'new-hash',
    });
    // In interactive mode without accept flag, it waits for user confirmation (handled by UI),
    // so it currently DOES NOT pass the directory to createPolicyEngineConfig yet.
    // The UI will handle the confirmation and reload/update.
    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePoliciesDir: undefined,
      }),
      expect.anything(),
    );
  });

  it('should set policyUpdateConfirmationRequest if integrity is NEW with files (first time seen) in interactive mode', async () => {
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: 'file',
    });
    mockCheckIntegrity.mockResolvedValue({
      status: 'new',
      hash: 'new-hash',
      fileCount: 5,
    });
    vi.mocked(ServerConfig.isHeadlessMode).mockReturnValue(false); // Interactive

    const settings = createTestMergedSettings();
    const argv = { query: 'test' } as unknown as CliArgs;

    const config = await loadCliConfig(settings, 'test-session', argv, {
      cwd: MOCK_CWD,
    });

    expect(config.getPolicyUpdateConfirmationRequest()).toEqual({
      scope: 'workspace',
      identifier: MOCK_CWD,
      policyDir: expect.stringContaining(path.join('.gemini', 'policies')),
      newHash: 'new-hash',
    });

    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        workspacePoliciesDir: undefined,
      }),
      expect.anything(),
    );
  });
});
