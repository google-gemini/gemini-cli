/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getPlaygroundsPath,
  generatePlaygroundName,
  createPlaygroundDirectory,
  setupPlayground,
} from './playground.js';

vi.mock('node:fs');
vi.mock('@google/gemini-cli-core', () => ({
  homedir: () => '/home/testuser',
  debugLogger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('playground utilities', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
    // Restore chdir mock
    vi.restoreAllMocks();
  });

  describe('getPlaygroundsPath', () => {
    it('should return environment variable path when set', () => {
      process.env['ANTIGRAVITY_PLAYGROUNDS_PATH'] = '/custom/playgrounds';
      expect(getPlaygroundsPath()).toBe('/custom/playgrounds');
    });

    it('should return macOS default path when on darwin', () => {
      delete process.env['ANTIGRAVITY_PLAYGROUNDS_PATH'];
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(getPlaygroundsPath()).toBe(
        path.join(
          '/home/testuser',
          'Library',
          'Application Support',
          'Antigravity',
          'User',
          'playgrounds',
        ),
      );
    });

    it('should return Windows default path when on win32', () => {
      delete process.env['ANTIGRAVITY_PLAYGROUNDS_PATH'];
      process.env['APPDATA'] = 'C:\\Users\\test\\AppData\\Roaming';
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getPlaygroundsPath()).toBe(
        path.join(
          'C:\\Users\\test\\AppData\\Roaming',
          'Antigravity',
          'User',
          'playgrounds',
        ),
      );
    });

    it('should return Linux default path when on linux', () => {
      delete process.env['ANTIGRAVITY_PLAYGROUNDS_PATH'];
      delete process.env['XDG_CONFIG_HOME'];
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getPlaygroundsPath()).toBe(
        path.join(
          '/home/testuser',
          '.config',
          'Antigravity',
          'User',
          'playgrounds',
        ),
      );
    });

    it('should use XDG_CONFIG_HOME on Linux when set', () => {
      delete process.env['ANTIGRAVITY_PLAYGROUNDS_PATH'];
      process.env['XDG_CONFIG_HOME'] = '/custom/config';
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getPlaygroundsPath()).toBe(
        path.join('/custom/config', 'Antigravity', 'User', 'playgrounds'),
      );
    });
  });

  describe('generatePlaygroundName', () => {
    it('should generate a name starting with playground-', () => {
      const name = generatePlaygroundName();
      expect(name).toMatch(/^playground-\d{14}-[a-z0-9]{6}$/);
    });

    it('should generate unique names on repeated calls', () => {
      const name1 = generatePlaygroundName();
      const name2 = generatePlaygroundName();
      expect(name1).not.toBe(name2);
    });
  });

  describe('createPlaygroundDirectory', () => {
    it('should create parent directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      process.env['ANTIGRAVITY_PLAYGROUNDS_PATH'] = '/test/playgrounds';
      const result = createPlaygroundDirectory();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/test/playgrounds', {
        recursive: true,
      });
      expect(result).toMatch(/^\/test\/playgrounds\/playground-/);
    });

    it('should not create parent directory if it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      process.env['ANTIGRAVITY_PLAYGROUNDS_PATH'] = '/test/playgrounds';
      createPlaygroundDirectory();

      // Only called once for the playground directory itself
      expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('setupPlayground', () => {
    it('should create directory and change to it', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      const chdirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => {});

      process.env['ANTIGRAVITY_PLAYGROUNDS_PATH'] = '/test/playgrounds';
      const result = setupPlayground();

      expect(result).toMatch(/^\/test\/playgrounds\/playground-/);
      expect(chdirSpy).toHaveBeenCalledWith(result);
    });
  });
});
