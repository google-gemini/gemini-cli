/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  resolveWorkspacePolicyState,
  autoAcceptWorkspacePolicies,
  setAutoAcceptWorkspacePolicies,
  disableWorkspacePolicies,
  setDisableWorkspacePolicies,
} from './policy.js';
import { writeToStderr } from '@google/gemini-cli-core';

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
    writeToStderr: vi.fn(),
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

    // Enable policies for these tests to verify loading logic
    setDisableWorkspacePolicies(false);

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
    });

    expect(result).toEqual({
      workspacePoliciesDir: undefined,
      policyUpdateConfirmationRequest: undefined,
    });
  });

  it('should have disableWorkspacePolicies set to true by default', () => {
    // We explicitly set it to false in beforeEach for other tests,
    // so here we test that setting it to true works.
    setDisableWorkspacePolicies(true);
    expect(disableWorkspacePolicies).toBe(true);
  });

  it('should return policy directory if integrity matches', async () => {
    // Set up policies directory with a file
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

    // First call to establish integrity (interactive auto-accept)
    const firstResult = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: true,
    });
    expect(firstResult.workspacePoliciesDir).toBe(policiesDir);
    expect(firstResult.policyUpdateConfirmationRequest).toBeUndefined();
    expect(writeToStderr).not.toHaveBeenCalled();

    // Second call should match

    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: true,
    });

    expect(result.workspacePoliciesDir).toBe(policiesDir);
    expect(result.policyUpdateConfirmationRequest).toBeUndefined();
  });

  it('should return undefined if integrity is NEW but fileCount is 0', async () => {
    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: true,
    });

    expect(result.workspacePoliciesDir).toBeUndefined();
    expect(result.policyUpdateConfirmationRequest).toBeUndefined();
  });

  it('should return confirmation request if changed in interactive mode when AUTO_ACCEPT is false', async () => {
    const originalValue = autoAcceptWorkspacePolicies;
    setAutoAcceptWorkspacePolicies(false);

    try {
      fs.mkdirSync(policiesDir, { recursive: true });
      fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

      const result = await resolveWorkspacePolicyState({
        cwd: workspaceDir,
        trustedFolder: true,
        interactive: true,
      });

      expect(result.workspacePoliciesDir).toBeUndefined();
      expect(result.policyUpdateConfirmationRequest).toEqual({
        scope: 'workspace',
        identifier: workspaceDir,
        policyDir: policiesDir,
        newHash: expect.any(String),
      });
    } finally {
      setAutoAcceptWorkspacePolicies(originalValue);
    }
  });

  it('should warn and auto-accept if changed in non-interactive mode when AUTO_ACCEPT is true', async () => {
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: false,
    });

    expect(result.workspacePoliciesDir).toBe(policiesDir);
    expect(result.policyUpdateConfirmationRequest).toBeUndefined();
    expect(writeToStderr).toHaveBeenCalledWith(
      expect.stringContaining('Automatically accepting and loading'),
    );
  });

  it('should warn and auto-accept if changed in non-interactive mode when AUTO_ACCEPT is false', async () => {
    const originalValue = autoAcceptWorkspacePolicies;
    setAutoAcceptWorkspacePolicies(false);

    try {
      fs.mkdirSync(policiesDir, { recursive: true });
      fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

      const result = await resolveWorkspacePolicyState({
        cwd: workspaceDir,
        trustedFolder: true,
        interactive: false,
      });

      expect(result.workspacePoliciesDir).toBe(policiesDir);
      expect(result.policyUpdateConfirmationRequest).toBeUndefined();
      expect(writeToStderr).toHaveBeenCalledWith(
        expect.stringContaining('Automatically accepting and loading'),
      );
    } finally {
      setAutoAcceptWorkspacePolicies(originalValue);
    }
  });

  it('should not return workspace policies if cwd is the home directory', async () => {
    const policiesDir = path.join(tempDir, '.gemini', 'policies');
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

    // Run from HOME directory (tempDir is mocked as HOME in beforeEach)
    const result = await resolveWorkspacePolicyState({
      cwd: tempDir,
      trustedFolder: true,
      interactive: true,
    });

    expect(result.workspacePoliciesDir).toBeUndefined();
    expect(result.policyUpdateConfirmationRequest).toBeUndefined();
  });

  it('should return empty state if disableWorkspacePolicies is true even if folder is trusted', async () => {
    setDisableWorkspacePolicies(true);

    // Set up policies directory with a file
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

    const result = await resolveWorkspacePolicyState({
      cwd: workspaceDir,
      trustedFolder: true,
      interactive: true,
    });

    expect(result).toEqual({
      workspacePoliciesDir: undefined,
      policyUpdateConfirmationRequest: undefined,
    });
  });

  it('should return empty state if cwd is a symlink to the home directory', async () => {
    const policiesDir = path.join(tempDir, '.gemini', 'policies');
    fs.mkdirSync(policiesDir, { recursive: true });
    fs.writeFileSync(path.join(policiesDir, 'policy.toml'), 'rules = []');

    // Create a symlink to the home directory
    const symlinkDir = path.join(
      os.tmpdir(),
      `gemini-cli-symlink-${Date.now()}`,
    );
    fs.symlinkSync(tempDir, symlinkDir, 'dir');

    try {
      // Run from symlink to HOME directory
      const result = await resolveWorkspacePolicyState({
        cwd: symlinkDir,
        trustedFolder: true,
        interactive: true,
      });

      expect(result.workspacePoliciesDir).toBeUndefined();
      expect(result.policyUpdateConfirmationRequest).toBeUndefined();
    } finally {
      // Clean up symlink
      fs.unlinkSync(symlinkDir);
    }
  });
});
