/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  Config,
  checkPathTrust,
  SimpleExtensionLoader,
} from '@google/gemini-cli-core';
import * as core from '@google/gemini-cli-core';
import { loadConfig } from './config.js';
import type { Settings } from './settings.js';

describe('Workspace Trust Evaluation', () => {
  let tempWorkspaceDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-trust-eval-'),
    );
    const geminiDir = path.join(tempWorkspaceDir, '.gemini');
    fs.mkdirSync(geminiDir, { recursive: true });

    vi.stubEnv('GEMINI_API_KEY', 'dummy-key-for-eval');
    vi.spyOn(Config.prototype, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(Config.prototype, 'waitForMcpInit').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
  });

  it('resolves untrusted environment signals in checkPathTrust', () => {
    vi.stubEnv('GEMINI_CLI_TRUST_WORKSPACE', 'false');

    const result = checkPathTrust({
      path: tempWorkspaceDir,
      isFolderTrustEnabled: true,
    });

    expect(result).toEqual({ isTrusted: false, source: 'env' });

    vi.stubEnv('GEMINI_RESTRICTED_MODE', 'true');

    const restrictedResult = checkPathTrust({
      path: tempWorkspaceDir,
      isFolderTrustEnabled: true,
    });

    expect(restrictedResult).toEqual({ isTrusted: false, source: 'env' });
  });

  it('evaluates to false in Config.isTrustedFolder when untrusted signals are present or undefined', () => {
    vi.stubEnv('GEMINI_CLI_TRUST_WORKSPACE', 'false');

    const untrustedConfig = new Config({
      sessionId: 'test-session',
      clientName: 'test-client',
      model: 'gemini-pro',
      targetDir: tempWorkspaceDir,
      cwd: tempWorkspaceDir,
      debugMode: false,
      question: '',
      folderTrust: false,
      trustedFolder: undefined,
    });

    expect(untrustedConfig.isTrustedFolder()).toBe(false);

    vi.unstubAllEnvs();
    vi.stubEnv('GEMINI_CLI_TRUST_WORKSPACE', '');

    const fallbackConfig = new Config({
      sessionId: 'test-session',
      clientName: 'test-client',
      model: 'gemini-pro',
      targetDir: tempWorkspaceDir,
      cwd: tempWorkspaceDir,
      debugMode: false,
      question: '',
      folderTrust: true,
      trustedFolder: undefined,
    });

    expect(fallbackConfig.isTrustedFolder()).toBe(false);
  });

  it('assigns undefined to mcpServers, policyPaths, adminPolicyPaths, tools, and telemetry in configParams and policySettings when trusted is false', async () => {
    const policySpy = vi.spyOn(core, 'createPolicyEngineConfig');
    const settings: Settings = {
      mcpServers: {
        'test-tool': {
          command: 'node',
          args: ['-e', 'process.exit(0)'],
        },
      },
      policyPaths: ['/test/policy/path'],
      adminPolicyPaths: ['/test/admin/policy/path'],
      tools: {
        allowed: ['shell'],
      },
      telemetry: {
        otlpEndpoint: 'http://untrusted-endpoint:4317',
      },
    };

    const config = await loadConfig(
      settings,
      new SimpleExtensionLoader([]),
      'test-untrusted-task',
      false,
      tempWorkspaceDir,
    );

    expect(config.getMcpServers()).toBeUndefined();
    expect(policySpy.mock.calls[0][0].mcpServers).toBeUndefined();
    expect(policySpy.mock.calls[0][0].policyPaths).toBeUndefined();
    expect(policySpy.mock.calls[0][0].adminPolicyPaths).toBeUndefined();
    expect(policySpy.mock.calls[0][0].tools?.allowed).toBeUndefined();
    expect(config.getTelemetryOtlpEndpoint()).not.toBe(
      'http://untrusted-endpoint:4317',
    );
    expect(settings.mcpServers).toBeDefined();
    expect(settings.policyPaths).toBeDefined();
    expect(settings.adminPolicyPaths).toBeDefined();
    expect(settings.tools).toBeDefined();
    expect(settings.telemetry).toBeDefined();
  });

  it('retains mcpServers, policyPaths, adminPolicyPaths, tools, and telemetry in configParams and policySettings when trusted is true', async () => {
    const policySpy = vi.spyOn(core, 'createPolicyEngineConfig');
    const settings: Settings = {
      mcpServers: {
        'test-tool': {
          command: 'node',
          args: ['-e', 'process.exit(0)'],
        },
      },
      policyPaths: ['/test/policy/path'],
      adminPolicyPaths: ['/test/admin/policy/path'],
      tools: {
        allowed: ['shell'],
      },
      telemetry: {
        otlpEndpoint: 'http://trusted-endpoint:4317',
      },
    };

    const config = await loadConfig(
      settings,
      new SimpleExtensionLoader([]),
      'test-trusted-task',
      true,
      tempWorkspaceDir,
    );

    expect(config.getMcpServers()).toEqual(settings.mcpServers);
    expect(policySpy.mock.calls[0][0].mcpServers).toEqual(settings.mcpServers);
    expect(policySpy.mock.calls[0][0].policyPaths).toEqual(
      settings.policyPaths,
    );
    expect(policySpy.mock.calls[0][0].adminPolicyPaths).toEqual(
      settings.adminPolicyPaths,
    );
    expect(policySpy.mock.calls[0][0].tools?.allowed).toEqual(['shell']);
    expect(config.getTelemetryOtlpEndpoint()).toBe(
      'http://trusted-endpoint:4317',
    );
  });
});
