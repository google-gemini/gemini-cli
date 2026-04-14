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

  afterEach(() => {
    if (fs.existsSync(tempHomeDir)) {
      fs.rmSync(tempHomeDir, { recursive: true, force: true });
    }
  });

  it('should NOT discover a plugin with plugin.json at root', async () => {
    const pluginDir = path.join(userExtensionsDir, 'test-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        name: 'hello-world',
        version: '1.0.0',
      }),
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'hello-world');

    expect(plugin).toBeUndefined();
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
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });

    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
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

  it('should load skills for Open Plugins', async () => {
    const pluginDir = path.join(userExtensionsDir, 'feature-plugin');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });
    const skillsDir = path.join(pluginDir, 'skills', 'test-skill');
    fs.mkdirSync(skillsDir, { recursive: true });

    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
      JSON.stringify({
        name: 'feature-plugin',
        version: '1.0.0',
      }),
    );

    fs.writeFileSync(
      path.join(skillsDir, 'SKILL.md'),
      `---
name: my-skill
description: "Test description"
---
Body`,
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'feature-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.skills).toBeDefined();
    expect(plugin?.skills?.[0].name).toBe('feature-plugin:my-skill');
    expect(plugin?.skills?.[0].extensionName).toBe('feature-plugin');
  });

  it('should load skills from custom path specified as string', async () => {
    const pluginDir = path.join(userExtensionsDir, 'custom-path-plugin');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });
    const skillsDir = path.join(pluginDir, 'custom-skills', 'test-skill');
    fs.mkdirSync(skillsDir, { recursive: true });

    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
      JSON.stringify({
        name: 'custom-path-plugin',
        version: '1.0.0',
        skills: './custom-skills',
      }),
    );

    fs.writeFileSync(
      path.join(skillsDir, 'SKILL.md'),
      `---
name: my-skill
description: "Test description"
---
Body`,
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'custom-path-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.skills).toBeDefined();
    expect(plugin?.skills?.[0].name).toBe('custom-path-plugin:my-skill');
  });

  it('should load skills from custom paths specified as array', async () => {
    const pluginDir = path.join(userExtensionsDir, 'array-path-plugin');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });
    const skillsDir1 = path.join(pluginDir, 'skills1', 'skill1');
    const skillsDir2 = path.join(pluginDir, 'skills2', 'skill2');
    fs.mkdirSync(skillsDir1, { recursive: true });
    fs.mkdirSync(skillsDir2, { recursive: true });

    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
      JSON.stringify({
        name: 'array-path-plugin',
        version: '1.0.0',
        skills: ['./skills1', './skills2'],
      }),
    );

    fs.writeFileSync(
      path.join(skillsDir1, 'SKILL.md'),
      `---
name: skill1
description: "Desc 1"
---
Body`,
    );

    fs.writeFileSync(
      path.join(skillsDir2, 'SKILL.md'),
      `---
name: skill2
description: "Desc 2"
---
Body`,
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'array-path-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.skills).toHaveLength(2);
    const skillNames = plugin?.skills?.map((s) => s.name);
    expect(skillNames).toContain('array-path-plugin:skill1');
    expect(skillNames).toContain('array-path-plugin:skill2');
  });

  it('should load skills from custom paths specified as object', async () => {
    const pluginDir = path.join(userExtensionsDir, 'object-path-plugin');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });
    const skillsDir = path.join(pluginDir, 'obj-skills', 'skill');
    fs.mkdirSync(skillsDir, { recursive: true });

    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
      JSON.stringify({
        name: 'object-path-plugin',
        version: '1.0.0',
        skills: { paths: ['./obj-skills'] },
      }),
    );

    fs.writeFileSync(
      path.join(skillsDir, 'SKILL.md'),
      `---
name: skill1
description: "Desc 1"
---
Body`,
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'object-path-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.skills?.[0].name).toBe('object-path-plugin:skill1');
  });

  it('should NOT load skills from default location if custom paths are specified', async () => {
    const pluginDir = path.join(userExtensionsDir, 'override-plugin');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });
    const defaultDir = path.join(pluginDir, 'skills', 'skill1');
    const customDir = path.join(pluginDir, 'custom-skills', 'skill2');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.mkdirSync(customDir, { recursive: true });

    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
      JSON.stringify({
        name: 'override-plugin',
        version: '1.0.0',
        skills: './custom-skills',
      }),
    );

    fs.writeFileSync(
      path.join(defaultDir, 'SKILL.md'),
      `---
name: skill1
description: "Default"
---
Body`,
    );

    fs.writeFileSync(
      path.join(customDir, 'SKILL.md'),
      `---
name: skill2
description: "Custom"
---
Body`,
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'override-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.skills).toHaveLength(1);
    expect(plugin?.skills?.[0].name).toBe('override-plugin:skill2');
  });

  it('should prioritize gemini-extension.json over plugin.json', async () => {
    const pluginDir = path.join(userExtensionsDir, 'dual-manifest-plugin');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'gemini-extension.json'),
      JSON.stringify({
        name: 'gemini-plugin',
        version: '1.1.1',
      }),
    );
    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
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

  it('should support new metadata and discovery fields with path validation', async () => {
    const pluginDir = path.join(userExtensionsDir, 'new-spec-plugin');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });

    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
      JSON.stringify({
        name: 'new-spec-plugin',
        version: '1.0.0',
        keywords: ['test', 'plugin'],
        homepage: 'https://example.com',
        repository: 'https://github.com/example/plugin',
        skills: './skills',
      }),
    );

    const extensions = await extensionManager.loadExtensions();
    const plugin = extensions.find((ext) => ext.name === 'new-spec-plugin');

    expect(plugin).toBeDefined();
    expect(plugin?.keywords).toEqual(['test', 'plugin']);
    expect(plugin?.homepage).toBe('https://example.com');
    expect(plugin?.repository).toBe('https://github.com/example/plugin');
    expect(plugin?.manifestType).toBe('open-plugin');
  });

  it('should fail validation if discovery path does not start with ./', async () => {
    const pluginDir = path.join(userExtensionsDir, 'invalid-path-plugin');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });

    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
      JSON.stringify({
        name: 'invalid-path-plugin',
        version: '1.0.0',
        skills: 'skills', // Missing ./
      }),
    );

    await expect(
      extensionManager.loadExtensionConfig(pluginDir),
    ).rejects.toThrow('Invalid plugin.json');
  });

  it('should fail validation if discovery path contains ../', async () => {
    const pluginDir = path.join(userExtensionsDir, 'traversal-plugin');
    const hiddenDir = path.join(pluginDir, '.plugin');
    fs.mkdirSync(hiddenDir, { recursive: true });

    fs.writeFileSync(
      path.join(hiddenDir, 'plugin.json'),
      JSON.stringify({
        name: 'traversal-plugin',
        version: '1.0.0',
        skills: './../outside', // Contains ../
      }),
    );

    await expect(
      extensionManager.loadExtensionConfig(pluginDir),
    ).rejects.toThrow('Invalid plugin.json');
  });
});
