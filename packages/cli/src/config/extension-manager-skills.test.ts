/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExtensionManager } from './extension-manager.js';
import { loadSettings } from './settings.js';
import { createExtension } from '../test-utils/createExtension.js';
import { EXTENSIONS_DIRECTORY_NAME } from './extensions/variables.js';
import { coreEvents, debugLogger } from '@google/gemini-cli-core';

const mockHomedir = vi.hoisted(() => vi.fn());

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof import('node:os')>();
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
  };
});

describe('ExtensionManager skills validation', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let userExtensionsDir: string;
  let extensionManager: ExtensionManager;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-skills-test-home-'),
    );
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(tempHomeDir, 'gemini-cli-skills-test-workspace-'),
    );
    userExtensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    mockHomedir.mockReturnValue(tempHomeDir);

    extensionManager = new ExtensionManager({
      workspaceDir: tempWorkspaceDir,
      requestConsent: vi.fn().mockResolvedValue(true),
      requestSetting: vi.fn().mockResolvedValue(''),
      settings: loadSettings(tempWorkspaceDir).merged,
    });
    vi.spyOn(coreEvents, 'emitFeedback');
    vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should emit a warning during install if skills directory is not empty but no skills are loaded', async () => {
    const sourceExtDir = createExtension({
      extensionsDir: tempHomeDir,
      name: 'skills-ext',
      version: '1.0.0',
    });

    const skillsDir = path.join(sourceExtDir, 'skills');
    fs.mkdirSync(skillsDir);
    fs.writeFileSync(path.join(skillsDir, 'not-a-skill.txt'), 'hello');

    await extensionManager.loadExtensions();
    const extension = await extensionManager.installOrUpdateExtension({
      source: sourceExtDir,
      type: 'local',
    });

    expect(extension.name).toBe('skills-ext');
    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load skills from'),
    );
  });

  it('should emit a warning during load if skills directory is not empty but no skills are loaded', async () => {
    const extDir = createExtension({
      extensionsDir: userExtensionsDir,
      name: 'load-skills-ext',
      version: '1.0.0',
    });

    const skillsDir = path.join(extDir, 'skills');
    fs.mkdirSync(skillsDir);
    fs.writeFileSync(path.join(skillsDir, 'not-a-skill.txt'), 'hello');

    await extensionManager.loadExtensions();

    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load skills from'),
    );
    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'The directory is not empty but no valid skills were discovered',
      ),
    );
  });

  it('should succeed if skills are correctly loaded', async () => {
    const sourceExtDir = createExtension({
      extensionsDir: tempHomeDir,
      name: 'good-skills-ext',
      version: '1.0.0',
    });

    const skillsDir = path.join(sourceExtDir, 'skills');
    const skillSubdir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillSubdir, { recursive: true });
    fs.writeFileSync(
      path.join(skillSubdir, 'SKILL.md'),
      '---\nname: test-skill\ndescription: test desc\n---\nbody',
    );

    await extensionManager.loadExtensions();
    const extension = await extensionManager.installOrUpdateExtension({
      source: sourceExtDir,
      type: 'local',
    });

    expect(extension.skills).toHaveLength(1);
    expect(extension.skills![0].name).toBe('test-skill');
    // It might be called for other reasons during startup, but shouldn't be called for our skills loading success
    // Actually, it shouldn't be called with our warning message
    expect(debugLogger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to load skills from'),
    );
  });
});
