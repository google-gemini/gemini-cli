/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExtensionManager } from './extension-manager.js';
import { createTestMergedSettings } from './settings.js';
import {
  loadAgentsFromDirectory,
  loadSkillsFromDir,
} from '@google/gemini-cli-core';

let currentTempHome = '';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: () => currentTempHome,
    debugLogger: {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
    loadAgentsFromDirectory: vi.fn().mockImplementation(async () => ({
      agents: [],
      errors: [],
    })),
    loadSkillsFromDir: vi.fn().mockImplementation(async () => []),
  };
});

describe('ExtensionManager Settings Scope', () => {
  const extensionName = 'test-extension';
  let tempWorkspace: string;
  let extensionsDir: string;
  let extensionDir: string;

  beforeEach(async () => {
    vi.mocked(loadAgentsFromDirectory).mockResolvedValue({
      agents: [],
      errors: [],
    });
    vi.mocked(loadSkillsFromDir).mockResolvedValue([]);
    currentTempHome = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempWorkspace = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    extensionsDir = path.join(currentTempHome, '.gemini', 'extensions');
    extensionDir = path.join(extensionsDir, extensionName);

    fs.mkdirSync(extensionDir, { recursive: true });

    // Create gemini-extension.json
    const extensionConfig = {
      name: extensionName,
      version: '1.0.0',
      settings: [
        {
          name: 'Test Setting',
          envVar: 'TEST_SETTING',
          description: 'A test setting',
        },
      ],
    };
    fs.writeFileSync(
      path.join(extensionDir, 'gemini-extension.json'),
      JSON.stringify(extensionConfig),
    );

    // Create install metadata
    const installMetadata = {
      source: extensionDir,
      type: 'local',
    };
    fs.writeFileSync(
      path.join(extensionDir, 'install-metadata.json'),
      JSON.stringify(installMetadata),
    );
  });

  afterEach(() => {
    // Clean up files if needed, or rely on temp dir cleanup
    vi.clearAllMocks();
  });

  it('should prioritize workspace settings over user settings and report correct scope', async () => {
    // 1. Set User Setting
    const userSettingsPath = path.join(extensionDir, '.env');
    fs.writeFileSync(userSettingsPath, 'TEST_SETTING=user-value');

    // 2. Set Workspace Setting
    const workspaceSettingsPath = path.join(tempWorkspace, '.env');
    fs.writeFileSync(workspaceSettingsPath, 'TEST_SETTING=workspace-value');

    const extensionManager = new ExtensionManager({
      workspaceDir: tempWorkspace,
      requestConsent: async () => true,
      requestSetting: async () => '',
      settings: createTestMergedSettings({
        telemetry: { enabled: false },
        experimental: { extensionConfig: true },
      }),
    });

    const extensions = await extensionManager.loadExtensions();
    const extension = extensions.find((e) => e.name === extensionName);

    expect(extension).toBeDefined();

    // Verify resolved settings
    const setting = extension?.resolvedSettings?.find(
      (s) => s.envVar === 'TEST_SETTING',
    );
    expect(setting).toBeDefined();
    expect(setting?.value).toBe('workspace-value');
    expect(setting?.scope).toBe('workspace');
    expect(setting?.source).toBe(workspaceSettingsPath);

    // Verify output string contains (Workspace - <path>)
    const output = extensionManager.toOutputString(extension!);
    expect(output).toContain(
      `Test Setting: workspace-value (Workspace - ${workspaceSettingsPath})`,
    );
  });

  it('should fallback to user settings if workspace setting is missing', async () => {
    // 1. Set User Setting
    const userSettingsPath = path.join(extensionDir, '.env');
    fs.writeFileSync(userSettingsPath, 'TEST_SETTING=user-value');

    // 2. No Workspace Setting

    const extensionManager = new ExtensionManager({
      workspaceDir: tempWorkspace,
      requestConsent: async () => true,
      requestSetting: async () => '',
      settings: createTestMergedSettings({
        telemetry: { enabled: false },
        experimental: { extensionConfig: true },
      }),
    });

    const extensions = await extensionManager.loadExtensions();
    const extension = extensions.find((e) => e.name === extensionName);

    expect(extension).toBeDefined();

    // Verify resolved settings
    const setting = extension?.resolvedSettings?.find(
      (s) => s.envVar === 'TEST_SETTING',
    );
    expect(setting).toBeDefined();
    expect(setting?.value).toBe('user-value');
    expect(setting?.scope).toBe('user');
    expect(setting?.source?.endsWith(path.join(extensionName, '.env'))).toBe(
      true,
    );

    // Verify output string contains (User - <path>)
    const output = extensionManager.toOutputString(extension!);
    expect(output).toContain(
      `Test Setting: user-value (User - ${userSettingsPath})`,
    );
  });

  it('should report unset if neither is present', async () => {
    // No settings files

    const extensionManager = new ExtensionManager({
      workspaceDir: tempWorkspace,
      requestConsent: async () => true,
      requestSetting: async () => '',
      settings: createTestMergedSettings({
        telemetry: { enabled: false },
        experimental: { extensionConfig: true },
      }),
    });

    const extensions = await extensionManager.loadExtensions();
    const extension = extensions.find((e) => e.name === extensionName);

    expect(extension).toBeDefined();

    // Verify resolved settings
    const setting = extension?.resolvedSettings?.find(
      (s) => s.envVar === 'TEST_SETTING',
    );
    expect(setting).toBeDefined();
    expect(setting?.value).toBe('[not set]');
    expect(setting?.scope).toBeUndefined();

    // Verify output string does not contain scope
    const output = extensionManager.toOutputString(extension!);
    expect(output).toContain('Test Setting: [not set]');
    expect(output).not.toContain('Test Setting: [not set] (User)');
    expect(output).not.toContain('Test Setting: [not set] (Workspace)');
  });
});
