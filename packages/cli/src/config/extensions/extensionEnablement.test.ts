/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtensionEnablementManager, Override } from './extensionEnablement.js';

import { ExtensionStorage } from './storage.js';

vi.mock('./storage.js');

import {
  coreEvents,
  GEMINI_DIR,
  type GeminiCLIExtension,
} from '@google/gemini-cli-core';

vi.mock('node:os', () => ({
  homedir: vi.fn().mockReturnValue('/virtual-home'),
  tmpdir: vi.fn().mockReturnValue('/virtual-tmp'),
}));

const inMemoryFs: { [key: string]: string } = {};

// Helper to create a temporary directory for testing
function createTestDir() {
  const dirPath = `/virtual-tmp/gemini-test-${Math.random().toString(36).substring(2, 15)}`;
  inMemoryFs[dirPath] = ''; // Simulate directory existence
  return {
    path: dirPath,
    cleanup: () => {
      for (const key in inMemoryFs) {
        if (key.startsWith(dirPath)) {
          delete inMemoryFs[key];
        }
      }
    },
  };
}

let testDir: { path: string; cleanup: () => void };
let manager: ExtensionEnablementManager;

describe('ExtensionEnablementManager', () => {
  beforeEach(() => {
    // Clear the in-memory file system before each test
    for (const key in inMemoryFs) {
      delete inMemoryFs[key];
    }
    expect(Object.keys(inMemoryFs).length).toBe(0); // Add this assertion

    // Mock fs functions
    vi.spyOn(fs, 'readFileSync').mockImplementation(
      (path: fs.PathOrFileDescriptor) => {
        const content = inMemoryFs[path.toString()];
        if (content === undefined) {
          const error = new Error(
            `ENOENT: no such file or directory, open '${path}'`,
          );
          (error as NodeJS.ErrnoException).code = 'ENOENT';
          throw error;
        }
        return content;
      },
    );
    vi.spyOn(fs, 'writeFileSync').mockImplementation(
      (
        path: fs.PathOrFileDescriptor,
        data: string | ArrayBufferView<ArrayBufferLike>,
      ) => {
        inMemoryFs[path.toString()] = data.toString(); // Convert ArrayBufferView to string for inMemoryFs
      },
    );
    vi.spyOn(fs, 'mkdirSync').mockImplementation(
      (
        _path: fs.PathLike,
        _options?: fs.MakeDirectoryOptions | fs.Mode | null,
      ) => undefined,
    );
    vi.spyOn(fs, 'mkdtempSync').mockImplementation((prefix: string) => {
      const virtualPath = `/virtual-tmp/${prefix.replace(/[^a-zA-Z0-9]/g, '')}`;
      return virtualPath;
    });
    vi.spyOn(fs, 'rmSync').mockImplementation(() => {});

    testDir = createTestDir();
    vi.mocked(ExtensionStorage.getUserExtensionsDir).mockReturnValue(
      path.join(testDir.path, GEMINI_DIR),
    );
    manager = new ExtensionEnablementManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Reset the singleton instance for test isolation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ExtensionEnablementManager as any).instance = undefined;
  });

  describe('isEnabled', () => {
    it('should return true if extension is not configured', () => {
      expect(manager.isEnabled('ext-test', '/any/path')).toBe(true);
    });

    it('should return true if no overrides match', () => {
      manager.disable('ext-test', false, '/another/path');
      expect(manager.isEnabled('ext-test', '/any/path')).toBe(true);
    });

    it('should enable a path based on an override rule', () => {
      manager.disable('ext-test', true, '/');
      manager.enable('ext-test', true, '/home/user/projects/');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        true,
      );
    });

    it('should disable a path based on a disable override rule', () => {
      manager.enable('ext-test', true, '/');
      manager.disable('ext-test', true, '/home/user/projects/');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        false,
      );
    });

    it('should respect the last matching rule (enable wins)', () => {
      manager.disable('ext-test', true, '/home/user/projects/');
      manager.enable('ext-test', false, '/home/user/projects/my-app');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        true,
      );
    });

    it('should respect the last matching rule (disable wins)', () => {
      manager.enable('ext-test', true, '/home/user/projects/');
      manager.disable('ext-test', false, '/home/user/projects/my-app');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        false,
      );
    });

    it('should handle overlapping rules correctly', () => {
      manager.enable('ext-test', true, '/home/user/projects');
      manager.disable('ext-test', false, '/home/user/projects/my-app');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        false,
      );
      expect(
        manager.isEnabled('ext-test', '/home/user/projects/something-else'),
      ).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove an extension from the config', () => {
      manager.enable('ext-test', true, '/path/to/dir');
      const config = manager.readConfig();
      expect(config['ext-test']).toBeDefined();

      manager.remove('ext-test');
      const newConfig = manager.readConfig();
      expect(newConfig['ext-test']).toBeUndefined();
    });

    it('should not throw when removing a non-existent extension', () => {
      const config = manager.readConfig();
      expect(config['ext-test']).toBeUndefined();
      expect(() => manager.remove('ext-test')).not.toThrow();
    });
  });

  describe('readConfig', () => {
    it('should return an empty object if the config file is corrupted', () => {
      const configPath = path.join(
        testDir.path,
        GEMINI_DIR,
        'extension-enablement.json',
      );
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, 'not a json');
      const config = manager.readConfig();
      expect(config).toEqual({});
    });

    it('should return an empty object on generic read error', () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('Read error');
      });
      const config = manager.readConfig();
      expect(config).toEqual({});
    });
  });

  describe('includeSubdirs', () => {
    it('should add a glob when enabling with includeSubdirs', () => {
      manager.enable('ext-test', true, '/path/to/dir');
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('/path/to/dir/*');
    });

    it('should not add a glob when enabling without includeSubdirs', () => {
      manager.enable('ext-test', false, '/path/to/dir');
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('/path/to/dir/');
      expect(config['ext-test'].overrides).not.toContain('/path/to/dir/*');
    });

    it('should add a glob when disabling with includeSubdirs', () => {
      manager.disable('ext-test', true, '/path/to/dir');
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('!/path/to/dir/*');
    });

    it('should remove conflicting glob rule when enabling without subdirs', () => {
      manager.enable('ext-test', true, '/path/to/dir'); // Adds /path/to/dir*
      manager.enable('ext-test', false, '/path/to/dir'); // Should remove the glob
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('/path/to/dir/');
      expect(config['ext-test'].overrides).not.toContain('/path/to/dir/*');
    });

    it('should remove conflicting non-glob rule when enabling with subdirs', () => {
      manager.enable('ext-test', false, '/path/to/dir'); // Adds /path/to/dir
      manager.enable('ext-test', true, '/path/to/dir'); // Should remove the non-glob
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('/path/to/dir/*');
      expect(config['ext-test'].overrides).not.toContain('/path/to/dir/');
    });

    it('should remove conflicting rules when disabling', () => {
      manager.enable('ext-test', true, '/path/to/dir'); // enabled with glob
      manager.disable('ext-test', false, '/path/to/dir'); // disabled without
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('!/path/to/dir/');
      expect(config['ext-test'].overrides).not.toContain('/path/to/dir/*');
    });

    it('should correctly evaluate isEnabled with subdirs', () => {
      manager.disable('ext-test', true, '/');
      manager.enable('ext-test', true, '/path/to/dir');
      expect(manager.isEnabled('ext-test', '/path/to/dir/')).toBe(true);
      expect(manager.isEnabled('ext-test', '/path/to/dir/sub/')).toBe(true);
      expect(manager.isEnabled('ext-test', '/path/to/another/')).toBe(false);
    });

    it('should correctly evaluate isEnabled without subdirs', () => {
      manager.disable('ext-test', true, '/*');
      manager.enable('ext-test', false, '/path/to/dir');
      expect(manager.isEnabled('ext-test', '/path/to/dir')).toBe(true);
      expect(manager.isEnabled('ext-test', '/path/to/dir/sub')).toBe(false);
    });
  });

  describe('pruning child rules', () => {
    it('should remove child rules when enabling a parent with subdirs', () => {
      // Pre-existing rules for children
      manager.enable('ext-test', false, '/path/to/dir/subdir1');
      manager.disable('ext-test', true, '/path/to/dir/subdir2');
      manager.enable('ext-test', false, '/path/to/another/dir');

      // Enable the parent directory
      manager.enable('ext-test', true, '/path/to/dir');

      const config = manager.readConfig();
      const overrides = config['ext-test'].overrides;

      // The new parent rule should be present
      expect(overrides).toContain(`/path/to/dir/*`);

      // Child rules should be removed
      expect(overrides).not.toContain('/path/to/dir/subdir1/');
      expect(overrides).not.toContain(`!/path/to/dir/subdir2/*`);

      // Unrelated rules should remain
      expect(overrides).toContain('/path/to/another/dir/');
    });

    it('should remove child rules when disabling a parent with subdirs', () => {
      // Pre-existing rules for children
      manager.enable('ext-test', false, '/path/to/dir/subdir1');
      manager.disable('ext-test', true, '/path/to/dir/subdir2');
      manager.enable('ext-test', false, '/path/to/another/dir');

      // Disable the parent directory
      manager.disable('ext-test', true, '/path/to/dir');

      const config = manager.readConfig();
      const overrides = config['ext-test'].overrides;

      // The new parent rule should be present
      expect(overrides).toContain(`!/path/to/dir/*`);

      // Child rules should be removed
      expect(overrides).not.toContain('/path/to/dir/subdir1/');
      expect(overrides).not.toContain(`!/path/to/dir/subdir2/*`);

      // Unrelated rules should remain
      expect(overrides).toContain('/path/to/another/dir/');
    });

    it('should not remove child rules if includeSubdirs is false', () => {
      manager.enable('ext-test', false, '/path/to/dir/subdir1');
      manager.enable('ext-test', false, '/path/to/dir'); // Not including subdirs

      const config = manager.readConfig();
      const overrides = config['ext-test'].overrides;

      expect(overrides).toContain('/path/to/dir/subdir1/');
      expect(overrides).toContain('/path/to/dir/');
    });
  });

  it('should correctly prioritize more specific enable rules', () => {
    manager.disable('ext-test', true, '/Users/chrstn');
    manager.enable('ext-test', true, '/Users/chrstn/gemini-cli');

    expect(manager.isEnabled('ext-test', '/Users/chrstn/gemini-cli')).toBe(
      true,
    );
  });

  it('should not disable subdirectories if includeSubdirs is false', () => {
    manager.disable('ext-test', false, '/Users/chrstn');
    expect(manager.isEnabled('ext-test', '/Users/chrstn/gemini-cli')).toBe(
      true,
    );
  });

  describe('extension overrides (-e <name>)', () => {
    beforeEach(() => {
      manager = new ExtensionEnablementManager(['ext-test']);
    });

    it('can enable extensions, case-insensitive', () => {
      manager.disable('ext-test', true, '/');
      expect(manager.isEnabled('ext-test', '/')).toBe(true);
      expect(manager.isEnabled('Ext-Test', '/')).toBe(true);
      // Double check that it would have been disabled otherwise
      expect(new ExtensionEnablementManager().isEnabled('ext-test', '/')).toBe(
        false,
      );
    });

    it('disable all other extensions', () => {
      manager = new ExtensionEnablementManager(['ext-test']);
      manager.enable('ext-test-2', true, '/');
      expect(manager.isEnabled('ext-test-2', '/')).toBe(false);
      // Double check that it would have been enabled otherwise
      expect(
        new ExtensionEnablementManager().isEnabled('ext-test-2', '/'),
      ).toBe(true);
    });

    it('none disables all extensions', () => {
      manager = new ExtensionEnablementManager(['none']);
      manager.enable('ext-test', true, '/');
      expect(manager.isEnabled('ext-test', '/path/to/dir')).toBe(false);
      // Double check that it would have been enabled otherwise
      expect(new ExtensionEnablementManager().isEnabled('ext-test', '/')).toBe(
        true,
      );
    });
  });

  describe('validateExtensionOverrides', () => {
    let coreEventsEmitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      coreEventsEmitSpy = vi.spyOn(coreEvents, 'emitFeedback');
    });

    afterEach(() => {
      coreEventsEmitSpy.mockRestore();
    });

    it('should not log an error if enabledExtensionNamesOverride is empty', () => {
      const manager = new ExtensionEnablementManager([]);
      manager.validateExtensionOverrides([]);
      expect(coreEventsEmitSpy).not.toHaveBeenCalled();
    });

    it('should not log an error if all enabledExtensionNamesOverride are valid', () => {
      const manager = new ExtensionEnablementManager(['ext-one', 'ext-two']);
      const extensions = [
        { name: 'ext-one' },
        { name: 'ext-two' },
      ] as GeminiCLIExtension[];
      manager.validateExtensionOverrides(extensions);
      expect(coreEventsEmitSpy).not.toHaveBeenCalled();
    });

    it('should log an error for each invalid extension name in enabledExtensionNamesOverride', () => {
      const manager = new ExtensionEnablementManager([
        'ext-one',
        'ext-invalid',
        'ext-another-invalid',
      ]);
      const extensions = [
        { name: 'ext-one' },
        { name: 'ext-two' },
      ] as GeminiCLIExtension[];
      manager.validateExtensionOverrides(extensions);
      expect(coreEventsEmitSpy).toHaveBeenCalledTimes(2);
      expect(coreEventsEmitSpy).toHaveBeenCalledWith(
        'error',
        'Extension not found: ext-invalid',
      );
      expect(coreEventsEmitSpy).toHaveBeenCalledWith(
        'error',
        'Extension not found: ext-another-invalid',
      );
    });

    it('should not log an error if "none" is in enabledExtensionNamesOverride', () => {
      const manager = new ExtensionEnablementManager(['none']);
      manager.validateExtensionOverrides([]);
      expect(coreEventsEmitSpy).not.toHaveBeenCalled();
    });
  });
});

describe('Override', () => {
  it('should create an override from input', () => {
    const override = Override.fromInput('/path/to/dir', true);
    expect(override.baseRule).toBe(`/path/to/dir/`);
    expect(override.isDisable).toBe(false);
    expect(override.includeSubdirs).toBe(true);
  });

  it('should create a disable override from input', () => {
    const override = Override.fromInput('!/path/to/dir', false);
    expect(override.baseRule).toBe(`/path/to/dir/`);
    expect(override.isDisable).toBe(true);
    expect(override.includeSubdirs).toBe(false);
  });

  it('should create an override from a file rule', () => {
    const override = Override.fromFileRule('/path/to/dir/');
    expect(override.baseRule).toBe('/path/to/dir/');
    expect(override.isDisable).toBe(false);
    expect(override.includeSubdirs).toBe(false);
  });

  it('should create an override from a file rule without a trailing slash', () => {
    const override = Override.fromFileRule('/path/to/dir');
    expect(override.baseRule).toBe('/path/to/dir');
    expect(override.isDisable).toBe(false);
    expect(override.includeSubdirs).toBe(false);
  });

  it('should create a disable override from a file rule', () => {
    const override = Override.fromFileRule('!/path/to/dir/');
    expect(override.isDisable).toBe(true);
    expect(override.baseRule).toBe('/path/to/dir/');
    expect(override.includeSubdirs).toBe(false);
  });

  it('should create an override with subdirs from a file rule', () => {
    const override = Override.fromFileRule('/path/to/dir/*');
    expect(override.baseRule).toBe('/path/to/dir/');
    expect(override.isDisable).toBe(false);
    expect(override.includeSubdirs).toBe(true);
  });

  it('should correctly identify conflicting overrides', () => {
    const override1 = Override.fromInput('/path/to/dir', true);
    const override2 = Override.fromInput('/path/to/dir', false);
    expect(override1.conflictsWith(override2)).toBe(true);
  });

  it('should correctly identify non-conflicting overrides', () => {
    const override1 = Override.fromInput('/path/to/dir', true);
    const override2 = Override.fromInput('/path/to/another/dir', true);
    expect(override1.conflictsWith(override2)).toBe(false);
  });

  it('should correctly identify equal overrides', () => {
    const override1 = Override.fromInput('/path/to/dir', true);
    const override2 = Override.fromInput('/path/to/dir', true);
    expect(override1.isEqualTo(override2)).toBe(true);
  });

  it('should correctly identify unequal overrides', () => {
    const override1 = Override.fromInput('/path/to/dir', true);
    const override2 = Override.fromInput('!/path/to/dir', true);
    expect(override1.isEqualTo(override2)).toBe(false);
  });

  it('should generate the correct regex', () => {
    const override = Override.fromInput('/path/to/dir', true);
    const regex = override.asRegex();
    expect(regex.test('/path/to/dir/')).toBe(true);
    expect(regex.test('/path/to/dir/subdir')).toBe(true);
    expect(regex.test('/path/to/another/dir')).toBe(false);
  });

  it('should correctly identify child overrides', () => {
    const parent = Override.fromInput('/path/to/dir', true);
    const child = Override.fromInput('/path/to/dir/subdir', false);
    expect(child.isChildOf(parent)).toBe(true);
  });

  it('should correctly identify child overrides with glob', () => {
    const parent = Override.fromInput('/path/to/dir/*', true);
    const child = Override.fromInput('/path/to/dir/subdir', false);
    expect(child.isChildOf(parent)).toBe(true);
  });

  it('should correctly identify non-child overrides', () => {
    const parent = Override.fromInput('/path/to/dir', true);
    const other = Override.fromInput('/path/to/another/dir', false);
    expect(other.isChildOf(parent)).toBe(false);
  });

  it('should generate the correct output string', () => {
    const override = Override.fromInput('/path/to/dir', true);
    expect(override.output()).toBe(`/path/to/dir/*`);
  });

  it('should generate the correct output string for a disable override', () => {
    const override = Override.fromInput('!/path/to/dir', false);
    expect(override.output()).toBe(`!/path/to/dir/`);
  });

  it('should disable a path based on a disable override rule', () => {
    const override = Override.fromInput('!/path/to/dir', false);
    expect(override.output()).toBe(`!/path/to/dir/`);
  });
});
