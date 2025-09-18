/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExtensionEnablementManager } from './extensionEnablement.js';

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
      manager.disable('ext-test', true, '*'); // Disable globally
      manager.enable('ext-test', true, '/home/user/projects/');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        true,
      );
    });

    it('should disable a path based on a disable override rule', () => {
      manager.enable('ext-test', true, '*'); // Enable globally
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
  });

  describe('includeSubdirs', () => {
    it('should add a glob when enabling with includeSubdirs', () => {
      manager.enable('ext-test', true, '/path/to/dir');
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('/path/to/dir*');
    });

    it('should not add a glob when enabling without includeSubdirs', () => {
      manager.enable('ext-test', false, '/path/to/dir');
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('/path/to/dir');
      expect(config['ext-test'].overrides).not.toContain('/path/to/dir*');
    });

    it('should add a glob when disabling with includeSubdirs', () => {
      manager.disable('ext-test', true, '/path/to/dir');
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('!/path/to/dir*');
    });

    it('should remove conflicting glob rule when enabling without subdirs', () => {
      manager.enable('ext-test', true, '/path/to/dir'); // Adds /path/to/dir*
      manager.enable('ext-test', false, '/path/to/dir'); // Should remove the glob
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('/path/to/dir');
      expect(config['ext-test'].overrides).not.toContain('/path/to/dir*');
    });

    it('should remove conflicting non-glob rule when enabling with subdirs', () => {
      manager.enable('ext-test', false, '/path/to/dir'); // Adds /path/to/dir
      manager.enable('ext-test', true, '/path/to/dir'); // Should remove the non-glob
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('/path/to/dir*');
      expect(config['ext-test'].overrides).not.toContain('/path/to/dir');
    });

    it('should remove conflicting rules when disabling', () => {
      manager.enable('ext-test', true, '/path/to/dir'); // enabled with glob
      manager.disable('ext-test', false, '/path/to/dir'); // disabled without
      const config = manager.readConfig();
      expect(config['ext-test'].overrides).toContain('!/path/to/dir');
      expect(config['ext-test'].overrides).not.toContain('/path/to/dir*');
    });

    it('should correctly evaluate isEnabled with subdirs', () => {
      manager.disable('ext-test', true, '*');
      manager.enable('ext-test', true, '/path/to/dir');
      expect(manager.isEnabled('ext-test', '/path/to/dir')).toBe(true);
      expect(manager.isEnabled('ext-test', '/path/to/dir/sub')).toBe(true);
      expect(manager.isEnabled('ext-test', '/path/to/another')).toBe(false);
    });

    it('should correctly evaluate isEnabled without subdirs', () => {
      manager.disable('ext-test', true, '*');
      manager.enable('ext-test', false, '/path/to/dir');
      expect(manager.isEnabled('ext-test', '/path/to/dir')).toBe(true);
      expect(manager.isEnabled('ext-test', '/path/to/dir/sub')).toBe(false);
    });
  });
});
