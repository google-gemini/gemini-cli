/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveWorkspacePolicyState } from './policy.js';
import { debugLogger } from '@google/gemini-cli-core';

// Mock debugLogger to avoid noise in test output
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    debugLogger: {
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('resolveWorkspacePolicyState', () => {
  let tempDir: string;
  let workspaceDir: string;
  let policiesDir: string;

  beforeEach(() => {
    // Create a temporary directory for the test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-cli-test-'));
    // Redirect GEMINI_CLI_HOME to the temp directory to isolate integrity storage
    vi.stubEnv('GEMINI_CLI_HOME', tempDir);

    workspaceDir = path.join(tempDir, 'workspace');
    fs.mkdirSync(workspaceDir);
    policiesDir = path.join(workspaceDir, '.gemini', 'policies');

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('should return empty state if folder is not trusted', async () => {
    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: false,
      interactive: true,
      acceptChangedPolicies: false,
    });

    expect(result).toEqual({
      workspacePoliciesDir: undefined,
      policyUpdateConfirmationRequest: undefined,
    });
  });

  it('should return policy directory if integrity matches', async () => {
    // Set up policies directory with a file
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

    // First call to establish integrity (auto-accept)
    await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: true,
      acceptChangedPolicies: true,
    });

    // Second call should match
    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: true,
      acceptChangedPolicies: false,
    });

    expect(result.workspacePoliciesDir).toBe(policiesDir);
    expect(result.policyUpdateConfirmationRequest).toBeUndefined();
  });

  it('should return undefined if integrity is NEW but fileCount is 0', async () => {
    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: true,
      acceptChangedPolicies: false,
    });

    expect(result.workspacePoliciesDir).toBeUndefined();
    expect(result.policyUpdateConfirmationRequest).toBeUndefined();
  });

  it('should auto-accept changed policies if acceptChangedPolicies is true', async () => {
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: true,
      acceptChangedPolicies: true,
    });

    expect(result.workspacePoliciesDir).toBe(policiesDir);
    expect(result.policyUpdateConfirmationRequest).toBeUndefined();
    expect(debugLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Auto-accepting'),
    );
  });

  it('should return confirmation request if changed in interactive mode', async () => {
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: true,
      acceptChangedPolicies: false,
    });

    expect(result.workspacePoliciesDir).toBeUndefined();
    expect(result.policyUpdateConfirmationRequest).toEqual({
      scope: 'workspace',
      identifier: workspaceDir,
      policyDir: policiesDir,
      newHash: expect.any(String),
    });
  });

  it('should warn and return undefined if changed in non-interactive mode', async () => {
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: false,
      acceptChangedPolicies: false,
    });

    expect(result.workspacePoliciesDir).toBeUndefined();
    expect(result.policyUpdateConfirmationRequest).toBeUndefined();
    expect(debugLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Loading default policies only'),
    );
  });
});
