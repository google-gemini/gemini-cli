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
import { debugLogger } from '@google/gemini-cli-core';
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
  const core = await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...core,
    homedir: mockHomedir,
    loadAgentsFromDirectory: core.loadAgentsFromDirectory,
    loadSkillsFromDir: core.loadSkillsFromDir,
  };
});

describe('ExtensionManager agents loading', () => {
  let extensionManager: ExtensionManager;
  let tempDir: string;
  let extensionsDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-agents-'));
    mockHomedir.mockReturnValue(tempDir);

    // Create the extensions directory that ExtensionManager expects
    extensionsDir = path.join(tempDir, '.gemini', EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(extensionsDir, { recursive: true });

    extensionManager = new ExtensionManager({
      settings: createTestMergedSettings({
        telemetry: { enabled: false },
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

  it('should load agents from an extension', async () => {
    const sourceDir = path.join(tempDir, 'source-ext-good');
    createExtension({
      extensionsDir: sourceDir,
      name: 'good-agents-ext',
      version: '1.0.0',
      installMetadata: {
        type: 'local',
        source: path.join(sourceDir, 'good-agents-ext'),
      },
    });
    const extensionPath = path.join(sourceDir, 'good-agents-ext');

    const agentsDir = path.join(extensionPath, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'test-agent.md'),
      '---\nname: test-agent\nkind: local\ndescription: test desc\n---\nbody',
    );

    await extensionManager.loadExtensions();

    const extension = await extensionManager.installOrUpdateExtension({
      type: 'local',
      source: extensionPath,
    });

    expect(extension.name).toBe('good-agents-ext');
    expect(extension.agents).toBeDefined();
    expect(extension.agents).toHaveLength(1);
    expect(extension.agents![0].name).toBe('test-agent');
    expect(debugLogger.warn).not.toHaveBeenCalled();
  });

  it('should log errors but continue if an agent fails to load', async () => {
    const sourceDir = path.join(tempDir, 'source-ext-bad');
    createExtension({
      extensionsDir: sourceDir,
      name: 'bad-agents-ext',
      version: '1.0.0',
      installMetadata: {
        type: 'local',
        source: path.join(sourceDir, 'bad-agents-ext'),
      },
    });
    const extensionPath = path.join(sourceDir, 'bad-agents-ext');

    const agentsDir = path.join(extensionPath, 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    // Invalid agent (missing description)
    fs.writeFileSync(
      path.join(agentsDir, 'bad-agent.md'),
      '---\nname: bad-agent\nkind: local\n---\nbody',
    );

    await extensionManager.loadExtensions();

    const extension = await extensionManager.installOrUpdateExtension({
      type: 'local',
      source: extensionPath,
    });

    expect(extension.name).toBe('bad-agents-ext');
    expect(extension.agents).toEqual([]);
    expect(debugLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error loading agent from bad-agents-ext'),
    );
  });
});
