/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { Config, ConfigParameters } from '@gemini-cli/core';

// Mock file discovery service and tool registry
vi.mock('@gemini-cli/core', async () => {
  const actual = await vi.importActual('@gemini-cli/core');
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
        apiKey: 'test-key',
        model: 'test-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        userAgent: 'test-agent',
        fileFilteringRespectGitIgnore: undefined, // Should default to true
        fileFilteringAllowBuildArtifacts: undefined, // Should default to false
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
      expect(config.getFileFilteringAllowBuildArtifacts()).toBe(false);
    });

    it('should load custom file filtering settings from configuration', async () => {
      const configParams: ConfigParameters = {
        apiKey: 'test-key',
        model: 'test-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        userAgent: 'test-agent',
        fileFilteringRespectGitIgnore: false,
        fileFilteringAllowBuildArtifacts: true,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
      expect(config.getFileFilteringAllowBuildArtifacts()).toBe(true);
    });

    it('should merge user and workspace file filtering settings', async () => {
      const configParams: ConfigParameters = {
        apiKey: 'test-key',
        model: 'test-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        userAgent: 'test-agent',
        fileFilteringRespectGitIgnore: true,
        fileFilteringAllowBuildArtifacts: true,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringAllowBuildArtifacts()).toBe(true);
      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    });
  });

  describe('Configuration Integration', () => {
    it('should handle partial configuration objects gracefully', async () => {
      const configParams: ConfigParameters = {
        apiKey: 'test-key',
        model: 'test-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        userAgent: 'test-agent',
        fileFilteringRespectGitIgnore: false,
        fileFilteringAllowBuildArtifacts: undefined, // Should default to false
      };

      const config = new Config(configParams);

      // Specified settings should be applied
      expect(config.getFileFilteringRespectGitIgnore()).toBe(false);

      // Missing settings should use defaults
      expect(config.getFileFilteringAllowBuildArtifacts()).toBe(false);
    });

    it('should handle empty configuration objects gracefully', async () => {
      const configParams: ConfigParameters = {
        apiKey: 'test-key',
        model: 'test-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        userAgent: 'test-agent',
        fileFilteringRespectGitIgnore: undefined,
        fileFilteringAllowBuildArtifacts: undefined,
      };

      const config = new Config(configParams);

      // All settings should use defaults
      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
      expect(config.getFileFilteringAllowBuildArtifacts()).toBe(false);
    });

    it('should handle missing configuration sections gracefully', async () => {
      const configParams: ConfigParameters = {
        apiKey: 'test-key',
        model: 'test-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        userAgent: 'test-agent',
        // Missing fileFiltering configuration
      };

      const config = new Config(configParams);

      // All git-aware settings should use defaults
      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
      expect(config.getFileFilteringAllowBuildArtifacts()).toBe(false);
    });
  });

  describe('Real-world Configuration Scenarios', () => {
    it('should handle a security-focused configuration', async () => {
      const configParams: ConfigParameters = {
        apiKey: 'test-key',
        model: 'test-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        userAgent: 'test-agent',
        fileFilteringRespectGitIgnore: true,
        fileFilteringAllowBuildArtifacts: false,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
      expect(config.getFileFilteringAllowBuildArtifacts()).toBe(false);
    });

    it('should handle a development-focused configuration', async () => {
      const configParams: ConfigParameters = {
        apiKey: 'test-key',
        model: 'test-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        userAgent: 'test-agent',
        fileFilteringRespectGitIgnore: true,
        fileFilteringAllowBuildArtifacts: true,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringAllowBuildArtifacts()).toBe(true);
    });

    it('should handle a CI/CD environment configuration', async () => {
      const configParams: ConfigParameters = {
        apiKey: 'test-key',
        model: 'test-model',
        sandbox: false,
        targetDir: tempDir,
        debugMode: false,
        userAgent: 'test-agent',
        fileFilteringRespectGitIgnore: false, // CI might need to see all files
        fileFilteringAllowBuildArtifacts: true,
      };

      const config = new Config(configParams);

      expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
      expect(config.getFileFilteringAllowBuildArtifacts()).toBe(true);
    });
  });
});
