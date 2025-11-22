/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  loadExtensions,
  EXTENSIONS_DIRECTORY_NAME,
  EXTENSIONS_CONFIG_FILENAME,
} from './extension.js';
import type { ExtensionConfig } from './extension.js';

// Mock modules
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

describe('extension loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadExtensions', () => {
    it('should load extensions from workspace and home directory', async () => {
      const fs = await import('node:fs');
      const { logger } = await import('../utils/logger.js');

      const workspaceDir = '/workspace';
      const homeDir = '/home/testuser';

      // Mock workspace extensions directory
      vi.mocked(fs.existsSync).mockImplementation((_path: unknown) => {
        const pathStr = String(path);
        if (pathStr.includes(`${workspaceDir}/${EXTENSIONS_DIRECTORY_NAME}`)) {
          return true;
        }
        if (pathStr.includes(`${homeDir}/${EXTENSIONS_DIRECTORY_NAME}`)) {
          return false;
        }
        if (pathStr.includes(EXTENSIONS_CONFIG_FILENAME)) {
          return true;
        }
        return false;
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['ext1'] as unknown);

      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as unknown);

      const extensionConfig: ExtensionConfig = {
        name: 'test-extension',
        version: '1.0.0',
        contextFileName: 'GEMINI.md',
      };

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(extensionConfig),
      );

      const extensions = loadExtensions(workspaceDir);

      expect(extensions).toHaveLength(1);
      expect(extensions[0].config.name).toBe('test-extension');
      expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
        expect.stringContaining('Loading extension: test-extension'),
      );
    });

    it('should deduplicate extensions by name', async () => {
      const fs = await import('node:fs');
      const workspaceDir = '/workspace';

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['ext1', 'ext2'] as unknown);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as unknown);

      let callCount = 0;
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        callCount++;
        const config: ExtensionConfig = {
          name: 'duplicate-extension', // Same name for both
          version: callCount === 1 ? '1.0.0' : '2.0.0',
        };
        return JSON.stringify(config);
      });

      const extensions = loadExtensions(workspaceDir);

      expect(extensions).toHaveLength(1);
      expect(extensions[0].config.version).toBe('1.0.0'); // First one wins
    });

    it('should handle missing extensions directories', async () => {
      const fs = await import('node:fs');

      vi.mocked(fs.existsSync).mockReturnValue(false);

      const extensions = loadExtensions('/workspace');

      expect(extensions).toEqual([]);
    });

    it('should handle invalid JSON in config files', async () => {
      const fs = await import('node:fs');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(fs.existsSync).mockImplementation(
        (_path: unknown) =>
          String(path).includes(EXTENSIONS_DIRECTORY_NAME) ||
          String(path).includes(EXTENSIONS_CONFIG_FILENAME),
      );

      vi.mocked(fs.readdirSync).mockReturnValue(['ext1'] as unknown);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as unknown);

      vi.mocked(fs.readFileSync).mockReturnValue('invalid json{');

      const extensions = loadExtensions('/workspace');

      expect(extensions).toEqual([]);
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.stringContaining('error parsing extension config'),
      );
    });

    it('should handle missing config file in extension directory', async () => {
      const fs = await import('node:fs');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(fs.existsSync).mockImplementation((_path: unknown) => {
        const pathStr = String(path);
        return (
          pathStr.includes(EXTENSIONS_DIRECTORY_NAME) &&
          !pathStr.includes(EXTENSIONS_CONFIG_FILENAME)
        );
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['ext1'] as unknown);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as unknown);

      const extensions = loadExtensions('/workspace');

      expect(extensions).toEqual([]);
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.stringContaining('does not contain a config file'),
      );
    });

    it('should handle non-directory items in extensions folder', async () => {
      const fs = await import('node:fs');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['file.txt'] as unknown);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => false,
      } as unknown);

      const extensions = loadExtensions('/workspace');

      expect(extensions).toEqual([]);
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.stringContaining('unexpected file'),
      );
    });

    it('should handle config missing name or version', async () => {
      const fs = await import('node:fs');
      const { logger } = await import('../utils/logger.js');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['ext1'] as unknown);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as unknown);

      const invalidConfig = {
        // Missing name and version
        mcpServers: {},
      };

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

      const extensions = loadExtensions('/workspace');

      expect(extensions).toEqual([]);
      expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
        expect.stringContaining('missing name or version'),
      );
    });

    it('should load context files when specified', async () => {
      const fs = await import('node:fs');
      const workspaceDir = '/workspace';

      vi.mocked(fs.existsSync).mockImplementation(
        () =>
          // Allow extensions directory and config file to exist, and context files
          true,
      );

      vi.mocked(fs.readdirSync).mockReturnValue(['ext1'] as unknown);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as unknown);

      const extensionConfig: ExtensionConfig = {
        name: 'test-extension',
        version: '1.0.0',
        contextFileName: ['GEMINI.md', 'CONTEXT.md'],
      };

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(extensionConfig),
      );

      const extensions = loadExtensions(workspaceDir);

      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles).toHaveLength(2);
      expect(extensions[0].contextFiles[0]).toContain('GEMINI.md');
      expect(extensions[0].contextFiles[1]).toContain('CONTEXT.md');
    });

    it('should use default GEMINI.md when no contextFileName specified', async () => {
      const fs = await import('node:fs');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['ext1'] as unknown);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as unknown);

      const extensionConfig: ExtensionConfig = {
        name: 'test-extension',
        version: '1.0.0',
        // No contextFileName specified
      };

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(extensionConfig),
      );

      const extensions = loadExtensions('/workspace');

      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles[0]).toContain('GEMINI.md');
    });

    it('should handle single string contextFileName', async () => {
      const fs = await import('node:fs');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['ext1'] as unknown);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as unknown);

      const extensionConfig: ExtensionConfig = {
        name: 'test-extension',
        version: '1.0.0',
        contextFileName: 'CUSTOM.md',
      };

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(extensionConfig),
      );

      const extensions = loadExtensions('/workspace');

      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles[0]).toContain('CUSTOM.md');
    });

    it('should filter out non-existent context files', async () => {
      const fs = await import('node:fs');

      vi.mocked(fs.existsSync).mockImplementation((_path: unknown) => {
        const pathStr = String(path);
        if (pathStr.includes('EXISTING.md')) {
          return true;
        }
        if (pathStr.includes('MISSING.md')) {
          return false;
        }
        return (
          pathStr.includes(EXTENSIONS_DIRECTORY_NAME) ||
          pathStr.includes(EXTENSIONS_CONFIG_FILENAME)
        );
      });

      vi.mocked(fs.readdirSync).mockReturnValue(['ext1'] as unknown);
      vi.mocked(fs.statSync).mockReturnValue({
        isDirectory: () => true,
      } as unknown);

      const extensionConfig: ExtensionConfig = {
        name: 'test-extension',
        version: '1.0.0',
        contextFileName: ['EXISTING.md', 'MISSING.md'],
      };

      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify(extensionConfig),
      );

      const extensions = loadExtensions('/workspace');

      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles).toHaveLength(1);
      expect(extensions[0].contextFiles[0]).toContain('EXISTING.md');
    });
  });
});
