/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExtensionManager } from './extension-manager.js';
import { debugLogger, coreEvents } from '@google/gemini-cli-core';
import { createTestMergedSettings } from './settings.js';
import { createExtension } from '../test-utils/createExtension.js';
import { EXTENSIONS_DIRECTORY_NAME } from './extensions/variables.js';

const mockHomedir = vi.hoisted(() => vi.fn(() => '/tmp/mock-home'));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: mockHomedir,
  };
});

// Mock @google/gemini-cli-core
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: mockHomedir,
    // Use actual implementations for loading skills and agents to test hydration
    loadAgentsFromDirectory: actual.loadAgentsFromDirectory,
    loadSkillsFromDir: actual.loadSkillsFromDir,
  };
});

describe('ExtensionManager hydration', () => {
  let extensionManager: ExtensionManager;
  let tempDir: string;
  let extensionsDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(coreEvents, 'emitFeedback');
    vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
    mockHomedir.mockReturnValue(tempDir);

    // Create the extensions directory that ExtensionManager expects
    extensionsDir = path.join(tempDir, '.gemini', EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(extensionsDir, { recursive: true });

    extensionManager = new ExtensionManager({
      settings: createTestMergedSettings({
        telemetry: { enabled: false },
        experimental: { extensionConfig: true },
      }),
      requestConsent: vi.fn().mockResolvedValue(true),
      requestSetting: vi.fn(),
      workspaceDir: tempDir,
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should hydrate skill body with extension settings', async () => {
    const sourceDir = path.join(tempDir, 'source-ext-skill');
    const extensionName = 'skill-hydration-ext';
    createExtension({
      extensionsDir: sourceDir,
      name: extensionName,
      version: '1.0.0',
      settings: [
        {
          name: 'API Key',
          description: 'API Key',
          envVar: 'MY_API_KEY',
        },
      ],
      installMetadata: {
        type: 'local',
        source: path.join(sourceDir, extensionName),
      },
    });
    const extensionPath = path.join(sourceDir, extensionName);

    // Create skill with variable
    const skillsDir = path.join(extensionPath, 'skills');
    const skillSubdir = path.join(skillsDir, 'my-skill');
    fs.mkdirSync(skillSubdir, { recursive: true });
    fs.writeFileSync(
      path.join(skillSubdir, 'SKILL.md'),
      `---
name: my-skill
description: test
---
Use key: \${MY_API_KEY}
`,
    );

    await extensionManager.loadExtensions();

    extensionManager.setRequestSetting(async (setting) => {
      if (setting.envVar === 'MY_API_KEY') return 'secret-123';
      return '';
    });

    const extension = await extensionManager.installOrUpdateExtension({
      type: 'local',
      source: extensionPath,
    });

    expect(extension.skills).toHaveLength(1);
    expect(extension.skills![0].body).toContain('Use key: secret-123');
  });

  it('should hydrate agent system prompt with extension settings', async () => {
    const sourceDir = path.join(tempDir, 'source-ext-agent');
    const extensionName = 'agent-hydration-ext';
    createExtension({
      extensionsDir: sourceDir,
      name: extensionName,
      version: '1.0.0',
      settings: [
        {
          name: 'Model Name',
          description: 'Model',
          envVar: 'MODEL_NAME',
        },
      ],
      installMetadata: {
        type: 'local',
        source: path.join(sourceDir, extensionName),
      },
    });
    const extensionPath = path.join(sourceDir, extensionName);

    // Create agent with variable
    const agentsDir = path.join(extensionPath, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'my-agent.md'),
      `---
name: my-agent
description: test
---
System using model: \${MODEL_NAME}
`,
    );

    await extensionManager.loadExtensions();

    extensionManager.setRequestSetting(async (setting) => {
      if (setting.envVar === 'MODEL_NAME') return 'gemini-pro';
      return '';
    });

    const extension = await extensionManager.installOrUpdateExtension({
      type: 'local',
      source: extensionPath,
    });

    expect(extension.agents).toHaveLength(1);
    const agent = extension.agents![0];
    if (agent.kind === 'local') {
      expect(agent.promptConfig.systemPrompt).toContain(
        'System using model: gemini-pro',
      );
    } else {
      throw new Error('Expected local agent');
    }
  });

  it('should hydrate hooks with extension settings', async () => {
    const sourceDir = path.join(tempDir, 'source-ext-hooks');
    const extensionName = 'hooks-hydration-ext';
    createExtension({
      extensionsDir: sourceDir,
      name: extensionName,
      version: '1.0.0',
      settings: [
        {
          name: 'Hook Command',
          description: 'Cmd',
          envVar: 'HOOK_CMD',
        },
      ],
      installMetadata: {
        type: 'local',
        source: path.join(sourceDir, extensionName),
      },
    });
    const extensionPath = path.join(sourceDir, extensionName);

    const hooksDir = path.join(extensionPath, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(hooksDir, 'hooks.json'),
      JSON.stringify({
        hooks: {
          BeforeTool: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'echo $HOOK_CMD',
                },
              ],
            },
          ],
        },
      }),
    );

    // Enable hooks in settings
    extensionManager = new ExtensionManager({
      settings: createTestMergedSettings({
        telemetry: { enabled: false },
        experimental: { extensionConfig: true },
        tools: { enableHooks: true },
        hooksConfig: { enabled: true },
      }),
      requestConsent: vi.fn().mockResolvedValue(true),
      requestSetting: vi.fn(),
      workspaceDir: tempDir,
    });

    await extensionManager.loadExtensions();

    extensionManager.setRequestSetting(async (setting) => {
      if (setting.envVar === 'HOOK_CMD') return 'hello-world';
      return '';
    });

    const extension = await extensionManager.installOrUpdateExtension({
      type: 'local',
      source: extensionPath,
    });

    expect(extension.hooks).toBeDefined();
    expect(extension.hooks?.BeforeTool).toHaveLength(1);
    expect(extension.hooks?.BeforeTool![0].hooks[0].env?.['HOOK_CMD']).toBe(
      'hello-world',
    );
  });

  it('should pick up new settings after restartExtension', async () => {
    const sourceDir = path.join(tempDir, 'source-ext-restart');
    const extensionName = 'restart-hydration-ext';
    createExtension({
      extensionsDir: sourceDir,
      name: extensionName,
      version: '1.0.0',
      settings: [
        {
          name: 'Value',
          description: 'Val',
          envVar: 'MY_VALUE',
        },
      ],
      installMetadata: {
        type: 'local',
        source: path.join(sourceDir, extensionName),
      },
    });
    const extensionPath = path.join(sourceDir, extensionName);

    const skillsDir = path.join(extensionPath, 'skills');
    const skillSubdir = path.join(skillsDir, 'my-skill');
    fs.mkdirSync(skillSubdir, { recursive: true });
    fs.writeFileSync(
      path.join(skillSubdir, 'SKILL.md'),
      '---\nname: my-skill\ndescription: test\n---\nValue is: ${MY_VALUE}',
    );

    await extensionManager.loadExtensions();

    // Initial setting
    extensionManager.setRequestSetting(async () => 'first');
    const extension = await extensionManager.installOrUpdateExtension({
      type: 'local',
      source: extensionPath,
    });
    expect(extension.skills![0].body).toContain('Value is: first');

    const { updateSetting, ExtensionSettingScope } = await import(
      './extensions/extensionSettings.js'
    );
    const extensionConfig =
      await extensionManager.loadExtensionConfig(extensionPath);

    const mockRequestSetting = vi.fn().mockResolvedValue('second');
    await updateSetting(
      extensionConfig,
      extension.id,
      'MY_VALUE',
      mockRequestSetting,
      ExtensionSettingScope.USER,
      process.cwd(),
    );

    await extensionManager.restartExtension(extension);

    const reloadedExtension = extensionManager
      .getExtensions()
      .find((e) => e.name === extensionName)!;
    expect(reloadedExtension.skills![0].body).toContain('Value is: second');
  });
});
