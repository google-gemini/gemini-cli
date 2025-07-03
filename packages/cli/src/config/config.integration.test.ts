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

  describe('allowCommands Configuration', () => {
    it('should handle undefined allowCommands', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toBeUndefined();
    });

    it('should load allowCommands from configuration', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        allowCommands: ['ls', 'pwd', 'git*'],
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toEqual(['ls', 'pwd', 'git*']);
    });

    it('should handle empty allowCommands array', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        allowCommands: [],
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toEqual([]);
    });

    it('should handle various pattern types in allowCommands', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        allowCommands: [
          'ls', // exact match
          'git*', // glob pattern
          '*.sh', // glob pattern
          'test?', // glob pattern
          '/^npm\\s+test$/', // regex pattern
          'git status', // exact match with space
        ],
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toEqual([
        'ls',
        'git*',
        '*.sh',
        'test?',
        '/^npm\\s+test$/',
        'git status',
      ]);
    });

    it('should work alongside excludeTools', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        allowCommands: ['git*', 'npm*'],
        excludeTools: ['ShellTool(git push --force)'],
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toEqual(['git*', 'npm*']);
      expect(config.getExcludeTools()).toEqual(['ShellTool(git push --force)']);
    });

    it('should work alongside coreTools', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        allowCommands: ['ls', 'pwd'],
        coreTools: ['ShellTool', 'ReadFileTool'],
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toEqual(['ls', 'pwd']);
      expect(config.getCoreTools()).toEqual(['ShellTool', 'ReadFileTool']);
    });

    it('should handle special characters in patterns', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        allowCommands: [
          'git-flow',
          'npm@latest',
          'test_command',
          'docker-compose',
          './script.sh',
          '/usr/bin/ls',
        ],
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toEqual([
        'git-flow',
        'npm@latest',
        'test_command',
        'docker-compose',
        './script.sh',
        '/usr/bin/ls',
      ]);
    });

    it('should handle complex regex patterns', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        allowCommands: [
          '/^(ls|pwd|cd)$/',
          '/^git\\s+(status|log|diff)$/',
          '/^npm\\s+(test|install|run)$/',
          '/^make\\s+[a-z]+$/',
        ],
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toEqual([
        '/^(ls|pwd|cd)$/',
        '/^git\\s+(status|log|diff)$/',
        '/^npm\\s+(test|install|run)$/',
        '/^make\\s+[a-z]+$/',
      ]);
    });
  });

  describe('confirmCommands Configuration', () => {
    it('should handle undefined confirmCommands', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
      };

      const config = new Config(configParams);
      expect(config.getConfirmCommands()).toBeUndefined();
    });

    it('should load confirmCommands from configuration', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        confirmCommands: ['rm -rf', 'sudo*', 'chmod 777'],
      };

      const config = new Config(configParams);
      expect(config.getConfirmCommands()).toEqual([
        'rm -rf',
        'sudo*',
        'chmod 777',
      ]);
    });

    it('should handle empty confirmCommands array', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        confirmCommands: [],
      };

      const config = new Config(configParams);
      expect(config.getConfirmCommands()).toEqual([]);
    });

    it('should work alongside allowCommands', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        allowCommands: ['git*', 'npm*'],
        confirmCommands: ['git push --force', 'npm publish'],
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toEqual(['git*', 'npm*']);
      expect(config.getConfirmCommands()).toEqual([
        'git push --force',
        'npm publish',
      ]);
    });

    it('should handle various pattern types in confirmCommands', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        confirmCommands: [
          'rm -rf', // exact match
          'sudo*', // glob pattern
          '*.sh', // glob pattern
          '/^chmod\\s+777/', // regex pattern
          'git push --force', // exact match with spaces
        ],
      };

      const config = new Config(configParams);
      expect(config.getConfirmCommands()).toEqual([
        'rm -rf',
        'sudo*',
        '*.sh',
        '/^chmod\\s+777/',
        'git push --force',
      ]);
    });

    it('should handle complex security configurations', () => {
      const configParams: ConfigParameters = {
        cwd: '/tmp',
        contentGeneratorConfig: TEST_CONTENT_GENERATOR_CONFIG,
        embeddingModel: 'test-embedding-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        sessionId: 'test-session',
        model: 'test-model',
        allowCommands: ['ls', 'pwd', 'git status', 'git log', 'npm test'],
        confirmCommands: [
          'sudo*',
          'rm -rf',
          'chmod 777',
          'chown',
          '/.*\\s+--force/',
          'curl*-o*',
        ],
        excludeTools: ['ShellTool(rm -rf /)'],
      };

      const config = new Config(configParams);
      expect(config.getAllowCommands()).toBeDefined();
      expect(config.getConfirmCommands()).toBeDefined();
      expect(config.getExcludeTools()).toBeDefined();
      expect(config.getAllowCommands()?.length).toBe(5);
      expect(config.getConfirmCommands()?.length).toBe(6);
    });
  });
});
