/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExtensionEnablementManager, Override } from './extensionEnablement.js';

// Helper to create a temporary directory for testing
function createTestDir() {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
  return {
    path: dirPath,
    cleanup: () => fs.rmSync(dirPath, { recursive: true, force: true }),
  };
}

let testDir: { path: string; cleanup: () => void };
let configDir: string;
let manager: ExtensionEnablementManager;

describe('ExtensionEnablementManager', () => {
  beforeEach(() => {
    testDir = createTestDir();
    configDir = path.join(testDir.path, '.gemini');
    manager = new ExtensionEnablementManager(configDir);
  });

  afterEach(() => {
    testDir.cleanup();
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

    it('should handle', () => {
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

  it('should enable a path based on an enable override', () => {
    manager.disable('ext-test', true, '/Users/chrstn');
    manager.enable('ext-test', true, '/Users/chrstn/gemini-cli');

    expect(manager.isEnabled('ext-test', '/Users/chrstn/gemini-cli')).toBe(
      true,
    );
  });

  it('should ignore subdirs', () => {
    manager.disable('ext-test', false, '/Users/chrstn');
    expect(manager.isEnabled('ext-test', '/Users/chrstn/gemini-cli')).toBe(
      true,
    );
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
