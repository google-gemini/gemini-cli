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
import { debugLogger } from '@google/gemini-cli-core';
import type { Settings } from './settings.js';
import { createExtension } from '../test-utils/createExtension.js';
import { ExtensionStorage } from './extensions/storage.js';

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
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('ExtensionManager', () => {
  let extensionManager: ExtensionManager;
  let tempDir: string;
  let extensionsDir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    // Spy on debugLogger methods BEFORE creating ExtensionManager
    vi.spyOn(debugLogger, 'log').mockImplementation(() => {});
    vi.spyOn(debugLogger, 'error').mockImplementation(() => {});
    vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
    vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
    mockHomedir.mockReturnValue(tempDir);

    // Create the extensions directory that ExtensionManager expects
    // Use the actual storage logic to get the path to ensure separate sources of truth align
    extensionsDir = ExtensionStorage.getUserExtensionsDir();
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

  describe('multiple extensions loading', () => {
    it('should load multiple extensions in parallel', async () => {
      // Create 5 extensions
      createExtension({
        extensionsDir,
        name: 'ext-1',
        version: '1.0.0',
      });
      createExtension({
        extensionsDir,
        name: 'ext-2',
        version: '1.0.0',
      });
      createExtension({
        extensionsDir,
        name: 'ext-3',
        version: '1.0.0',
      });
      createExtension({
        extensionsDir,
        name: 'ext-4',
        version: '1.0.0',
      });
      createExtension({
        extensionsDir,
        name: 'ext-5',
        version: '1.0.0',
      });

      const extensions = await extensionManager.loadExtensions();

      expect(extensions).toHaveLength(5);
      expect(extensions.map((e) => e.name).sort()).toEqual([
        'ext-1',
        'ext-2',
        'ext-3',
        'ext-4',
        'ext-5',
      ]);
    });

    it('should load extensions even with different versions', async () => {
      createExtension({
        extensionsDir,
        name: 'ext-a',
        version: '1.0.0',
      });
      createExtension({
        extensionsDir,
        name: 'ext-b',
        version: '2.5.3',
      });
      createExtension({
        extensionsDir,
        name: 'ext-c',
        version: '0.1.0',
      });

      const extensions = await extensionManager.loadExtensions();

      expect(extensions).toHaveLength(3);
      const extA = extensions.find((e) => e.name === 'ext-a');
      const extB = extensions.find((e) => e.name === 'ext-b');
      const extC = extensions.find((e) => e.name === 'ext-c');

      expect(extA?.version).toBe('1.0.0');
      expect(extB?.version).toBe('2.5.3');
      expect(extC?.version).toBe('0.1.0');
    });
  });

  describe('duplicate extension names', () => {
    it('should detect and skip duplicate extension names', async () => {
      // Create two extensions with the same name in different directories
      const ext1Dir = path.join(extensionsDir, 'duplicate-1');
      const ext2Dir = path.join(extensionsDir, 'duplicate-2');

      fs.mkdirSync(ext1Dir, { recursive: true });
      fs.mkdirSync(ext2Dir, { recursive: true });

      // Both have the same name: "same-name"
      const config = {
        name: 'same-name',
        version: '1.0.0',
      };

      fs.writeFileSync(
        path.join(ext1Dir, 'gemini-extension.json'),
        JSON.stringify(config),
      );
      fs.writeFileSync(
        path.join(ext2Dir, 'gemini-extension.json'),
        JSON.stringify(config),
      );

      const extensions = await extensionManager.loadExtensions();

      // Should only load one
      expect(extensions).toHaveLength(1);
      expect(extensions[0].name).toBe('same-name');

      // Should log an error about the duplicate
      expect(debugLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Duplicate extension name detected: same-name'),
      );
    });

    it('should load the first extension and skip subsequent duplicates', async () => {
      // Create three extensions, two with duplicate names
      createExtension({
        extensionsDir,
        name: 'unique-ext',
        version: '1.0.0',
      });

      const dup1Dir = path.join(extensionsDir, 'dup-1');
      const dup2Dir = path.join(extensionsDir, 'dup-2');

      fs.mkdirSync(dup1Dir, { recursive: true });
      fs.mkdirSync(dup2Dir, { recursive: true });

      const dupConfig = {
        name: 'duplicate-ext',
        version: '1.0.0',
      };

      fs.writeFileSync(
        path.join(dup1Dir, 'gemini-extension.json'),
        JSON.stringify(dupConfig),
      );
      fs.writeFileSync(
        path.join(dup2Dir, 'gemini-extension.json'),
        JSON.stringify(dupConfig),
      );

      const extensions = await extensionManager.loadExtensions();

      // Should have 2 extensions: unique-ext and one duplicate-ext
      expect(extensions).toHaveLength(2);
      expect(extensions.map((e) => e.name).sort()).toEqual([
        'duplicate-ext',
        'unique-ext',
      ]);
    });
  });

  describe('partial failures', () => {
    it('should load valid extensions even when one fails', async () => {
      // Create two valid extensions
      createExtension({
        extensionsDir,
        name: 'good-ext-1',
        version: '1.0.0',
      });
      createExtension({
        extensionsDir,
        name: 'good-ext-2',
        version: '1.0.0',
      });

      // Create a bad extension with invalid JSON
      const badExtDir = path.join(extensionsDir, 'bad-ext');
      fs.mkdirSync(badExtDir, { recursive: true });
      fs.writeFileSync(
        path.join(badExtDir, 'gemini-extension.json'),
        '{ invalid json',
      );

      const extensions = await extensionManager.loadExtensions();

      // Should successfully load the 2 good extensions
      expect(extensions).toHaveLength(2);
      expect(extensions.map((e) => e.name).sort()).toEqual([
        'good-ext-1',
        'good-ext-2',
      ]);
    });

    it('should handle missing extension config files gracefully', async () => {
      // Create one valid extension
      createExtension({
        extensionsDir,
        name: 'valid-ext',
        version: '1.0.0',
      });

      // Create a directory without config file
      const missingConfigDir = path.join(extensionsDir, 'no-config');
      fs.mkdirSync(missingConfigDir, { recursive: true });

      const extensions = await extensionManager.loadExtensions();

      // Should only load the valid one
      expect(extensions).toHaveLength(1);
      expect(extensions[0].name).toBe('valid-ext');
    });

    it('should handle non-directory entries in extensions folder', async () => {
      // Create a valid extension
      createExtension({
        extensionsDir,
        name: 'valid-ext',
        version: '1.0.0',
      });

      // Create a file instead of a directory
      fs.writeFileSync(path.join(extensionsDir, 'not-a-directory.txt'), 'test');

      const extensions = await extensionManager.loadExtensions();

      // Should only load the valid extension
      expect(extensions).toHaveLength(1);
      expect(extensions[0].name).toBe('valid-ext');
    });

    it('should continue loading even if multiple extensions fail', async () => {
      // Create one valid extension
      createExtension({
        extensionsDir,
        name: 'only-good-ext',
        version: '1.0.0',
      });

      // Create multiple bad extensions
      const bad1Dir = path.join(extensionsDir, 'bad-1');
      const bad2Dir = path.join(extensionsDir, 'bad-2');
      const bad3Dir = path.join(extensionsDir, 'bad-3');

      fs.mkdirSync(bad1Dir, { recursive: true });
      fs.mkdirSync(bad2Dir, { recursive: true });
      fs.mkdirSync(bad3Dir, { recursive: true });

      fs.writeFileSync(path.join(bad1Dir, 'gemini-extension.json'), '{bad}');
      fs.writeFileSync(path.join(bad2Dir, 'gemini-extension.json'), '[bad]');
      // bad-3 has no config file at all

      const extensions = await extensionManager.loadExtensions();

      // Should successfully load only the good one
      expect(extensions).toHaveLength(1);
      expect(extensions[0].name).toBe('only-good-ext');
    });
  });

  describe('edge cases', () => {
    it('should handle empty extensions directory', async () => {
      // Directory exists but is empty
      const extensions = await extensionManager.loadExtensions();

      expect(extensions).toHaveLength(0);
      expect(extensions).toEqual([]);
    });

    it('should handle non-existent extensions directory', async () => {
      // Remove the extensions directory
      fs.rmSync(extensionsDir, { recursive: true, force: true });

      const extensions = await extensionManager.loadExtensions();

      expect(extensions).toHaveLength(0);
      expect(extensions).toEqual([]);
    });

    it('should not allow loading extensions twice', async () => {
      createExtension({
        extensionsDir,
        name: 'test-ext',
        version: '1.0.0',
      });

      // First load works
      await extensionManager.loadExtensions();

      // Second load should fail
      await expect(extensionManager.loadExtensions()).rejects.toThrow(
        'Extensions already loaded, only load extensions once.',
      );
    });
  });
});
