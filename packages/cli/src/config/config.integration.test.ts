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
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

export const server = setupServer();

// TODO(richieforeman): Consider moving this to test setup globally.
beforeAll(() => {
  server.listen({});
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

const CLEARCUT_URL = 'https://play.googleapis.com/log';

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

  beforeEach(() => {
    server.resetHandlers(http.post(CLEARCUT_URL, () => HttpResponse.text()));

    tempDir = fs.mkdtempSync(path.join(tmpdir(), 'gemini-cli-test-'));
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  describe('Approval Mode Integration Tests', () => {
    let parseArguments: typeof import('./config').parseArguments;

    beforeEach(async () => {
      // Import the argument parsing function for integration testing
      const { parseArguments: parseArgs } = await import('./config');
      parseArguments = parseArgs;
    });

    it('should parse --approval-mode=auto_edit correctly through the full argument parsing flow', async () => {
      const originalArgv = process.argv;

      try {
        process.argv = [
          'node',
          'script.js',
          '--approval-mode',
          'auto_edit',
          '-p',
          'test',
        ];

        const argv = await parseArguments();

        // Verify that the argument was parsed correctly
        expect(argv.approvalMode).toBe('auto_edit');
        expect(argv.prompt).toBe('test');
        expect(argv.yolo).toBe(false);
      } finally {
        process.argv = originalArgv;
      }
    });

    it('should parse --approval-mode=yolo correctly through the full argument parsing flow', async () => {
      const originalArgv = process.argv;

      try {
        process.argv = [
          'node',
          'script.js',
          '--approval-mode',
          'yolo',
          '-p',
          'test',
        ];

        const argv = await parseArguments();

        expect(argv.approvalMode).toBe('yolo');
        expect(argv.prompt).toBe('test');
        expect(argv.yolo).toBe(false); // Should NOT be set when using --approval-mode
      } finally {
        process.argv = originalArgv;
      }
    });

    it('should parse --approval-mode=default correctly through the full argument parsing flow', async () => {
      const originalArgv = process.argv;

      try {
        process.argv = [
          'node',
          'script.js',
          '--approval-mode',
          'default',
          '-p',
          'test',
        ];

        const argv = await parseArguments();

        expect(argv.approvalMode).toBe('default');
        expect(argv.prompt).toBe('test');
        expect(argv.yolo).toBe(false);
      } finally {
        process.argv = originalArgv;
      }
    });

    it('should parse legacy --yolo flag correctly', async () => {
      const originalArgv = process.argv;

      try {
        process.argv = ['node', 'script.js', '--yolo', '-p', 'test'];

        const argv = await parseArguments();

        expect(argv.yolo).toBe(true);
        expect(argv.approvalMode).toBeUndefined(); // Should NOT be set when using --yolo
        expect(argv.prompt).toBe('test');
      } finally {
        process.argv = originalArgv;
      }
    });

    it('should reject invalid approval mode values during argument parsing', async () => {
      const originalArgv = process.argv;

      try {
        process.argv = ['node', 'script.js', '--approval-mode', 'invalid_mode'];

        // Should throw during argument parsing due to yargs validation
        await expect(parseArguments()).rejects.toThrow();
      } finally {
        process.argv = originalArgv;
      }
    });

    it('should reject conflicting --yolo and --approval-mode flags', async () => {
      const originalArgv = process.argv;

      try {
        process.argv = [
          'node',
          'script.js',
          '--yolo',
          '--approval-mode',
          'default',
        ];

        // Should throw during argument parsing due to conflict validation
        await expect(parseArguments()).rejects.toThrow();
      } finally {
        process.argv = originalArgv;
      }
    });

    it('should handle backward compatibility with mixed scenarios', async () => {
      const originalArgv = process.argv;

      try {
        // Test that no approval mode arguments defaults to no flags set
        process.argv = ['node', 'script.js', '-p', 'test'];

        const argv = await parseArguments();

        expect(argv.approvalMode).toBeUndefined();
        expect(argv.yolo).toBe(false);
        expect(argv.prompt).toBe('test');
      } finally {
        process.argv = originalArgv;
      }
    });
  });
});
