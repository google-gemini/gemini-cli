/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ExtensionManager } from './extension-manager.js';
import { createTestMergedSettings } from './settings.js';
import { EXTENSIONS_DIRECTORY_NAME } from './extensions/variables.js';

const mockHomedir = vi.hoisted(() => vi.fn(() => '/tmp/mock-home'));
const mockIntegrityManager = vi.hoisted(() => ({
  verify: vi.fn().mockResolvedValue('verified'),
  store: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: mockHomedir,
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: mockHomedir,
    ExtensionIntegrityManager: vi
      .fn()
      .mockImplementation(() => mockIntegrityManager),
  };
});

describe('ExtensionManager - Open Plugin Support', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let userExtensionsDir: string;
  let extensionManager: ExtensionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(tempHomeDir, 'gemini-cli-test-workspace-'),
    );
    mockHomedir.mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    extensionManager = new ExtensionManager({
      settings: createTestMergedSettings(),
      workspaceDir: tempWorkspaceDir,
      requestConsent: vi.fn().mockResolvedValue(true),
      requestSetting: null,
      integrityManager: mockIntegrityManager,
    });
  });

  it('should discover a plugin with plugin.json', async () => {
    const pluginDir = path.join(userExtensionsDir, 'test-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        name: 'hello-world',
        version: '1.0.0',
        description: 'An Open Plugin test',
        author: { name: 'Taylor' },
        license: 'Apache-2.0',
      }),
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'hello-world');

    expect(plugin).toBeDefined();
    expect(plugin?.version).toBe('1.0.0');
    expect(plugin?.description).toBe('An Open Plugin test');
    expect(plugin?.manifestType).toBe('open-plugin');
    expect(plugin?.author).toEqual({ name: 'Taylor' });
    expect(plugin?.license).toBe('Apache-2.0');
  });

  it('should discover a plugin with .plugin/plugin.json', async () => {
    const pluginDir = path.join(userExtensionsDir, 'hidden-plugin-dir');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
      JSON.stringify({
        name: 'hidden-plugin',
        version: '2.0.0',
      }),
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'hidden-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.version).toBe('2.0.0');
    expect(plugin?.manifestType).toBe('open-plugin');
  });

  it('should support PLUGIN_ROOT variable alias in metadata', async () => {
    const pluginDir = path.join(userExtensionsDir, 'var-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });

    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        name: 'var-plugin',
        version: '1.0.0',
        description: 'Uses root: ${PLUGIN_ROOT}',
      }),
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'var-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.description).toBe(`Uses root: ${pluginDir}`);
  });

  it('should NOT load skills or context files for Open Plugins in v1', async () => {
    const pluginDir = path.join(userExtensionsDir, 'feature-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    const skillsDir = path.join(pluginDir, 'skills', 'test');
    fs.mkdirSync(skillsDir, { recursive: true });

    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        name: 'feature-plugin',
        version: '1.0.0',
      }),
    );

    fs.writeFileSync(
      path.join(skillsDir, 'SKILL.md'),
      `---
  name: test-skill
  description: "Test"
  ---
  Body`,
    );

    fs.writeFileSync(path.join(pluginDir, 'GEMINI.md'), '# Context');

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'feature-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.skills).toBeUndefined();
    expect(plugin?.contextFiles).toEqual([]);
  });

  it('should prioritize gemini-extension.json over plugin.json', async () => {
    const pluginDir = path.join(userExtensionsDir, 'dual-manifest-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'gemini-extension.json'),
      JSON.stringify({
        name: 'gemini-plugin',
        version: '1.1.1',
      }),
    );
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        name: 'open-plugin',
        version: '2.2.2',
      }),
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'gemini-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.version).toBe('1.1.1');
    expect(plugin?.manifestType).toBe('gemini');

    const openPlugin = extensions.find((ext) => ext.name === 'open-plugin');
    expect(openPlugin).toBeUndefined();
  });
});
