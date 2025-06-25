/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import {
  Config,
  ConfigParameters,
  ContentGeneratorConfig,
} from '@google/gemini-cli-core';

const TEST_CONTENT_GENERATOR_CONFIG: ContentGeneratorConfig = {
  apiKey: 'test-key',
  model: 'test-model',
  userAgent: 'test-agent',
};

// Mock file discovery service and tool registry
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    FileDiscoveryService: vi.fn().mockImplementation(() => ({
      initialize: vi.fn(),
    })),
    createToolRegistry: vi.fn().mockResolvedValue({}),
  };
});

describe('Configuration Integration Tests', () => {
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'gemini-cli-test-'));
    originalEnv = { ...process.env };
    process.env.GEMINI_API_KEY = 'test-api-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('File Filtering Configuration', () => {
    it('should load default file filtering settings', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFilteringRespectGitIgnore: undefined, // Should default to true
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });

    it('should load custom file filtering settings from configuration', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFiltering: {
          respectGitIgnore: false,
        },
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
    });

    it('should merge user and workspace file filtering settings', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFilteringRespectGitIgnore: true,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });
  });

  describe('Configuration Integration', () => {
    it('should handle partial configuration objects gracefully', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFiltering: {
          respectGitIgnore: false,
        },
      };

      const config = new Config(configParams);

      // Specified settings should be applied
      expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
    });

    it('should handle empty configuration objects gracefully', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFilteringRespectGitIgnore: undefined,
      };

      const config = new Config(configParams);

      // All settings should use defaults
      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });

    it('should handle missing configuration sections gracefully', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        // Missing fileFiltering configuration
      };

      const config = new Config(configParams);

      // All git-aware settings should use defaults
      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });
  });

  describe('Real-world Configuration Scenarios', () => {
    it('should handle a security-focused configuration', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFilteringRespectGitIgnore: true,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });

    it('should handle a CI/CD environment configuration', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        fileFiltering: {
          respectGitIgnore: false,
        }, // CI might need to see all files
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
    });
  });

  describe('Checkpointing Configuration', () => {
    it('should enable checkpointing when the setting is true', async () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        checkpointing: true,
      };

      const config = new Config(configParams);

      expect(config.getCheckpointingEnabled()).toBe(true);
    });
  });

  describe('Extension Context Files', () => {
    it('should have an empty array for extension context files by default', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
      };
      const config = new Config(configParams);
      expect(config.getExtensionContextFilePaths()).toEqual([]);
    });

    it('should correctly store and return extension context file paths', () => {
      const contextFiles = ['/path/to/file1.txt', '/path/to/file2.js'];
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        extensionContextFilePaths: contextFiles,
      };
      const config = new Config(configParams);
      expect(config.getExtensionContextFilePaths()).toEqual(contextFiles);
    });
  });
});
