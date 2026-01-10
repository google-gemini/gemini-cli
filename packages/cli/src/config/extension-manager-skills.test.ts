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
import { debugLogger, coreEvents } from '@google/gemini-cli-core';
import { type Settings } from './settings.js';
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
    debugLogger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    },
  };
});

describe('ExtensionManager skills validation', () => {
  let extensionManager: ExtensionManager;
  let tempDir: string;
  let extensionsDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(coreEvents, 'emitFeedback');

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
    mockHomedir.mockReturnValue(tempDir);

    // Create the extensions directory that ExtensionManager expects
    extensionsDir = path.join(tempDir, '.gemini', EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(extensionsDir, { recursive: true });

    extensionManager = new ExtensionManager({
      settings: {
        telemetry: { enabled: false },
        trustedFolders: [tempDir],
      } as unknown as Settings,
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

  it('should emit a warning during install if skills directory is not empty but no skills are loaded', async () => {
    // Create a source extension
    const sourceDir = path.join(tempDir, 'source-ext');
    createExtension({
      extensionsDir: sourceDir, // createExtension appends name
      name: 'skills-ext',
      version: '1.0.0',
      installMetadata: {
        type: 'local',
        source: path.join(sourceDir, 'skills-ext'),
      },
    });
    const extensionPath = path.join(sourceDir, 'skills-ext');

    // Add invalid skills content
    const skillsDir = path.join(extensionPath, 'skills');
    fs.mkdirSync(skillsDir);
    fs.writeFileSync(path.join(skillsDir, 'not-a-skill.txt'), 'hello');

    await extensionManager.loadExtensions();

    await extensionManager.installOrUpdateExtension({
      type: 'local',
      source: extensionPath,
    });

    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load skills from'),
    );
  });

  it('should emit a warning during load if skills directory is not empty but no skills are loaded', async () => {
    // Manually create an installed extension
    createExtension({
      extensionsDir,
      name: 'skills-ext-load',
      version: '1.0.0',
    });
    const extensionPath = path.join(extensionsDir, 'skills-ext-load');

    const skillsDir = path.join(extensionPath, 'skills');
    fs.mkdirSync(skillsDir);
    fs.writeFileSync(path.join(skillsDir, 'not-a-skill.txt'), 'hello');

    await extensionManager.loadExtensions();

    expect(debugLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load skills from'),
    );
  });

  it('should succeed if skills are correctly loaded', async () => {
    const sourceDir = path.join(tempDir, 'source-ext-good');
    createExtension({
      extensionsDir: sourceDir,
      name: 'good-skills-ext',
      version: '1.0.0',
      installMetadata: {
        type: 'local',
        source: path.join(sourceDir, 'good-skills-ext'),
      },
    });
    const extensionPath = path.join(sourceDir, 'good-skills-ext');

    const skillsDir = path.join(extensionPath, 'skills');
    const skillSubdir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillSubdir, { recursive: true });
    fs.writeFileSync(
      path.join(skillSubdir, 'SKILL.md'),
      '---\nname: test-skill\ndescription: test desc\n---\nbody',
    );

    await extensionManager.loadExtensions();

    const extension = await extensionManager.installOrUpdateExtension({
      type: 'local',
      source: extensionPath,
    });

    expect(extension.name).toBe('good-skills-ext');
    expect(debugLogger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to load skills from'),
    );
  });
});
