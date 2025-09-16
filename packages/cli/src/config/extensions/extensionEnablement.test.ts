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
    manager = ExtensionEnablementManager.getInstance(configDir);
  });

  afterEach(() => {
    testDir.cleanup();
    // Reset the singleton instance for test isolation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ExtensionEnablementManager as any).instance = undefined;
  });

  describe('isEnabled', () => {
    it('should return false if extension is not configured', () => {
      expect(manager.isEnabled('ext-test', '/any/path')).toBe(false);
    });

    it('should return true if default is enabled and no overrides match', () => {
      manager.enable('ext-test');
      expect(manager.isEnabled('ext-test', '/any/path')).toBe(true);
    });

    it('should return false if default is disabled and no overrides match', () => {
      manager.disable('ext-test');
      expect(manager.isEnabled('ext-test', '/any/path')).toBe(false);
    });

    it('should enable a path based on an override rule', () => {
      manager.disable('ext-test');
      manager.enable('ext-test', '/home/user/projects/*');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        true,
      );
    });

    it('should disable a path based on a disable override rule', () => {
      manager.enable('ext-test');
      manager.disable('ext-test', '/home/user/projects/*');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        false,
      );
    });

    it('should respect the last matching rule (enable wins)', () => {
      manager.enable('ext-test');
      manager.disable('ext-test', '/home/user/projects/*');
      manager.enable('ext-test', '/home/user/projects/my-app');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        true,
      );
    });

    it('should respect the last matching rule (disable wins)', () => {
      manager.disable('ext-test');
      manager.enable('ext-test', '/home/user/projects/*');
      manager.disable('ext-test', '/home/user/projects/my-app');
      expect(manager.isEnabled('ext-test', '/home/user/projects/my-app')).toBe(
        false,
      );
    });
  });

  describe('enable/disable/remove', () => {
    it('should set the default to enabled when no scope is provided', () => {
      manager.enable('ext-test');

      const configPath = path.join(configDir, 'extensions.json');
      const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(writtenConfig['ext-test'].default).toBe('enabled');
    });

    it('should add an enable rule for a given scope', () => {
      manager.enable('ext-test', '/path/to/enable');

      const configPath = path.join(configDir, 'extensions.json');
      const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(writtenConfig['ext-test'].overrides).toContain('/path/to/enable');
    });

    it('should set the default to disabled when no scope is provided', () => {
      manager.disable('ext-test');

      const configPath = path.join(configDir, 'extensions.json');
      const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(writtenConfig['ext-test'].default).toBe('disabled');
    });

    it('should add a disable rule for a given scope', () => {
      manager.disable('ext-test', '/path/to/disable');

      const configPath = path.join(configDir, 'extensions.json');
      const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(writtenConfig['ext-test'].overrides).toContain(
        '!/path/to/disable',
      );
    });

    it('should remove an extension from the config', () => {
      manager.enable('ext-test');
      manager.remove('ext-test');

      const configPath = path.join(configDir, 'extensions.json');
      const writtenConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(writtenConfig['ext-test']).toBeUndefined();
    });
  });
});
