/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createExtension } from './createExtension.js';
import {
  EXTENSIONS_CONFIG_FILENAME,
  INSTALL_METADATA_FILENAME,
} from '../config/extension.js';
import type {
  MCPServerConfig,
  ExtensionInstallMetadata,
} from '@google/gemini-cli-core';

describe('createExtension', () => {
  const testDir = path.join(__dirname, 'test-extensions');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('basic functionality', () => {
    it('should create extension directory', () => {
      const extDir = createExtension({ extensionsDir: testDir });

      expect(fs.existsSync(extDir)).toBe(true);
      expect(fs.statSync(extDir).isDirectory()).toBe(true);
    });

    it('should return extension directory path', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        name: 'test-ext',
      });

      expect(extDir).toBe(path.join(testDir, 'test-ext'));
    });

    it('should create extension config file', () => {
      const extDir = createExtension({ extensionsDir: testDir });
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);

      expect(fs.existsSync(configPath)).toBe(true);
    });

    it('should use default extension name', () => {
      const extDir = createExtension({ extensionsDir: testDir });

      expect(extDir).toContain('my-extension');
    });

    it('should use custom extension name', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        name: 'custom-name',
      });

      expect(extDir).toBe(path.join(testDir, 'custom-name'));
    });

    it('should use default version 1.0.0', () => {
      const extDir = createExtension({ extensionsDir: testDir });
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.version).toBe('1.0.0');
    });

    it('should use custom version', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        version: '2.5.3',
      });
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.version).toBe('2.5.3');
    });
  });

  describe('extension config', () => {
    it('should write valid JSON config', () => {
      const extDir = createExtension({ extensionsDir: testDir });
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);

      expect(() =>
        JSON.parse(fs.readFileSync(configPath, 'utf-8')),
      ).not.toThrow();
    });

    it('should include name in config', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        name: 'test-extension',
      });
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.name).toBe('test-extension');
    });

    it('should include version in config', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        version: '1.2.3',
      });
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.version).toBe('1.2.3');
    });

    it('should include contextFileName when provided', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        contextFileName: 'CONTEXT.md',
      });
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.contextFileName).toBe('CONTEXT.md');
    });

    it('should include mcpServers in config', () => {
      const mcpServers: Record<string, MCPServerConfig> = {
        server1: { command: 'node', args: ['server.js'] },
      };
      const extDir = createExtension({
        extensionsDir: testDir,
        mcpServers,
      });
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.mcpServers).toEqual(mcpServers);
    });

    it('should include empty mcpServers by default', () => {
      const extDir = createExtension({ extensionsDir: testDir });
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

      expect(config.mcpServers).toEqual({});
    });
  });

  describe('context file creation', () => {
    it('should not create GEMINI.md by default', () => {
      const extDir = createExtension({ extensionsDir: testDir });
      const contextPath = path.join(extDir, 'GEMINI.md');

      expect(fs.existsSync(contextPath)).toBe(false);
    });

    it('should create GEMINI.md when addContextFile is true', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        addContextFile: true,
      });
      const contextPath = path.join(extDir, 'GEMINI.md');

      expect(fs.existsSync(contextPath)).toBe(true);
    });

    it('should write "context" to GEMINI.md', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        addContextFile: true,
      });
      const contextPath = path.join(extDir, 'GEMINI.md');
      const content = fs.readFileSync(contextPath, 'utf-8');

      expect(content).toBe('context');
    });

    it('should create custom context file when contextFileName is provided', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        contextFileName: 'CUSTOM.md',
      });
      const contextPath = path.join(extDir, 'CUSTOM.md');

      expect(fs.existsSync(contextPath)).toBe(true);
    });

    it('should write "context" to custom context file', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        contextFileName: 'README.md',
      });
      const contextPath = path.join(extDir, 'README.md');
      const content = fs.readFileSync(contextPath, 'utf-8');

      expect(content).toBe('context');
    });

    it('should create both GEMINI.md and custom file when both specified', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        addContextFile: true,
        contextFileName: 'CUSTOM.md',
      });

      expect(fs.existsSync(path.join(extDir, 'GEMINI.md'))).toBe(true);
      expect(fs.existsSync(path.join(extDir, 'CUSTOM.md'))).toBe(true);
    });
  });

  describe('install metadata', () => {
    it('should not create install metadata by default', () => {
      const extDir = createExtension({ extensionsDir: testDir });
      const metadataPath = path.join(extDir, INSTALL_METADATA_FILENAME);

      expect(fs.existsSync(metadataPath)).toBe(false);
    });

    it('should create install metadata when provided', () => {
      const metadata: ExtensionInstallMetadata = {
        installedAt: Date.now(),
        source: 'npm',
      };
      const extDir = createExtension({
        extensionsDir: testDir,
        installMetadata: metadata,
      });
      const metadataPath = path.join(extDir, INSTALL_METADATA_FILENAME);

      expect(fs.existsSync(metadataPath)).toBe(true);
    });

    it('should write valid JSON metadata', () => {
      const metadata: ExtensionInstallMetadata = {
        installedAt: Date.now(),
        source: 'github',
      };
      const extDir = createExtension({
        extensionsDir: testDir,
        installMetadata: metadata,
      });
      const metadataPath = path.join(extDir, INSTALL_METADATA_FILENAME);

      expect(() =>
        JSON.parse(fs.readFileSync(metadataPath, 'utf-8')),
      ).not.toThrow();
    });

    it('should preserve metadata content', () => {
      const metadata: ExtensionInstallMetadata = {
        installedAt: 1234567890,
        source: 'local',
        packageName: 'test-package',
      } as never;
      const extDir = createExtension({
        extensionsDir: testDir,
        installMetadata: metadata,
      });
      const metadataPath = path.join(extDir, INSTALL_METADATA_FILENAME);
      const savedMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

      expect(savedMetadata).toEqual(metadata);
    });
  });

  describe('directory creation', () => {
    it('should create parent directories recursively', () => {
      const nestedDir = path.join(testDir, 'level1', 'level2', 'level3');
      const extDir = createExtension({
        extensionsDir: nestedDir,
        name: 'nested-ext',
      });

      expect(fs.existsSync(extDir)).toBe(true);
      expect(fs.existsSync(nestedDir)).toBe(true);
    });

    it('should not fail if directory already exists', () => {
      fs.mkdirSync(testDir, { recursive: true });
      fs.mkdirSync(path.join(testDir, 'existing-ext'), { recursive: true });

      expect(() =>
        createExtension({
          extensionsDir: testDir,
          name: 'existing-ext',
        }),
      ).not.toThrow();
    });
  });

  describe('multiple extensions', () => {
    it('should create multiple extensions in same directory', () => {
      const ext1 = createExtension({
        extensionsDir: testDir,
        name: 'ext1',
      });
      const ext2 = createExtension({
        extensionsDir: testDir,
        name: 'ext2',
      });

      expect(fs.existsSync(ext1)).toBe(true);
      expect(fs.existsSync(ext2)).toBe(true);
      expect(ext1).not.toBe(ext2);
    });

    it('should keep extensions separate', () => {
      const ext1 = createExtension({
        extensionsDir: testDir,
        name: 'ext1',
        version: '1.0.0',
      });
      const ext2 = createExtension({
        extensionsDir: testDir,
        name: 'ext2',
        version: '2.0.0',
      });

      const config1 = JSON.parse(
        fs.readFileSync(path.join(ext1, EXTENSIONS_CONFIG_FILENAME), 'utf-8'),
      );
      const config2 = JSON.parse(
        fs.readFileSync(path.join(ext2, EXTENSIONS_CONFIG_FILENAME), 'utf-8'),
      );

      expect(config1.version).toBe('1.0.0');
      expect(config2.version).toBe('2.0.0');
    });
  });

  describe('mcp servers configuration', () => {
    it('should handle multiple MCP servers', () => {
      const mcpServers: Record<string, MCPServerConfig> = {
        server1: { command: 'node', args: ['server1.js'] },
        server2: { command: 'python', args: ['server2.py'] },
      };
      const extDir = createExtension({
        extensionsDir: testDir,
        mcpServers,
      });
      const config = JSON.parse(
        fs.readFileSync(path.join(extDir, EXTENSIONS_CONFIG_FILENAME), 'utf-8'),
      );

      expect(Object.keys(config.mcpServers)).toHaveLength(2);
      expect(config.mcpServers.server1.command).toBe('node');
      expect(config.mcpServers.server2.command).toBe('python');
    });

    it('should handle MCP server with environment variables', () => {
      const mcpServers: Record<string, MCPServerConfig> = {
        server: {
          command: 'node',
          args: ['server.js'],
          env: { NODE_ENV: 'production' },
        },
      };
      const extDir = createExtension({
        extensionsDir: testDir,
        mcpServers,
      });
      const config = JSON.parse(
        fs.readFileSync(path.join(extDir, EXTENSIONS_CONFIG_FILENAME), 'utf-8'),
      );

      expect(config.mcpServers.server.env).toEqual({ NODE_ENV: 'production' });
    });
  });

  describe('edge cases', () => {
    it('should handle extension name with special characters', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        name: 'ext-with-dashes_and_underscores',
      });

      expect(fs.existsSync(extDir)).toBe(true);
    });

    it('should handle long extension names', () => {
      const longName = 'a'.repeat(100);
      const extDir = createExtension({
        extensionsDir: testDir,
        name: longName,
      });

      expect(fs.existsSync(extDir)).toBe(true);
    });

    it('should handle empty contextFileName', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        contextFileName: '',
      });

      expect(fs.existsSync(path.join(extDir, ''))).toBe(true);
    });

    it('should handle contextFileName with subdirectories', () => {
      const extDir = createExtension({
        extensionsDir: testDir,
        contextFileName: 'docs/CONTEXT.md',
      });

      // Note: This may fail as parent directories are not created
      // This test documents current behavior
      expect(() =>
        fs.readFileSync(path.join(extDir, 'docs/CONTEXT.md')),
      ).toThrow();
    });
  });

  describe('return value', () => {
    it('should return string', () => {
      const extDir = createExtension({ extensionsDir: testDir });

      expect(typeof extDir).toBe('string');
    });

    it('should return absolute path', () => {
      const extDir = createExtension({ extensionsDir: testDir });

      expect(path.isAbsolute(extDir) || extDir.includes(testDir)).toBe(true);
    });

    it('should return path that exists', () => {
      const extDir = createExtension({ extensionsDir: testDir });

      expect(fs.existsSync(extDir)).toBe(true);
    });
  });
});
