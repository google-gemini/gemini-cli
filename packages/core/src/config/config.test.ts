/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Config, createServerConfig, ConfigParameters } from './config.js';
import * as path from 'path';
import { setGeminiMdFilename as mockSetGeminiMdFilename } from '../tools/memoryTool.js';

// Mock dependencies that might be called during Config construction or createServerConfig
vi.mock('../tools/tool-registry', () => {
  const ToolRegistryMock = vi.fn();
  ToolRegistryMock.prototype.registerTool = vi.fn();
  ToolRegistryMock.prototype.discoverTools = vi.fn();
  ToolRegistryMock.prototype.getAllTools = vi.fn(() => []); // Mock methods if needed
  ToolRegistryMock.prototype.getTool = vi.fn();
  ToolRegistryMock.prototype.getFunctionDeclarations = vi.fn(() => []);
  return { ToolRegistry: ToolRegistryMock };
});

// Mock individual tools if their constructors are complex or have side effects
vi.mock('../tools/ls');
vi.mock('../tools/read-file');
vi.mock('../tools/grep');
vi.mock('../tools/glob');
vi.mock('../tools/edit');
vi.mock('../tools/shell');
vi.mock('../tools/write-file');
vi.mock('../tools/web-fetch');
vi.mock('../tools/read-many-files');
vi.mock('../tools/memoryTool', () => ({
  MemoryTool: vi.fn(),
  setGeminiMdFilename: vi.fn(),
  getCurrentGeminiMdFilename: vi.fn(() => 'GEMINI.md'), // Mock the original filename
  DEFAULT_CONTEXT_FILENAME: 'GEMINI.md',
  GEMINI_CONFIG_DIR: '.gemini',
}));

describe('Server Config (config.ts)', () => {
  const API_KEY = 'server-api-key';
  const MODEL = 'gemini-pro';
  const SANDBOX = false;
  const TARGET_DIR = '/path/to/target';
  const DEBUG_MODE = false;
  const QUESTION = 'test question';
  const FULL_CONTEXT = false;
  const USER_AGENT = 'ServerTestAgent/1.0';
  const USER_MEMORY = 'Test User Memory';
  const TELEMETRY = false;
  const baseParams: ConfigParameters = {
    apiKey: API_KEY,
    model: MODEL,
    sandbox: SANDBOX,
    targetDir: TARGET_DIR,
    debugMode: DEBUG_MODE,
    question: QUESTION,
    fullContext: FULL_CONTEXT,
    userAgent: USER_AGENT,
    userMemory: USER_MEMORY,
    telemetry: TELEMETRY,
  };

  beforeEach(() => {
    // Reset mocks if necessary
    vi.clearAllMocks();
  });

  it('Config constructor should store userMemory correctly', () => {
    const config = new Config(baseParams);

    expect(config.getUserMemory()).toBe(USER_MEMORY);
    // Verify other getters if needed
    expect(config.getApiKey()).toBe(API_KEY);
    expect(config.getModel()).toBe(MODEL);
    expect(config.getTargetDir()).toBe(path.resolve(TARGET_DIR)); // Check resolved path
    expect(config.getUserAgent()).toBe(USER_AGENT);
  });

  it('Config constructor should default userMemory to empty string if not provided', () => {
    const paramsWithoutMemory: ConfigParameters = { ...baseParams };
    delete paramsWithoutMemory.userMemory;
    const config = new Config(paramsWithoutMemory);

    expect(config.getUserMemory()).toBe('');
  });

  it('createServerConfig should pass userMemory to Config constructor', () => {
    const config = createServerConfig(baseParams);

    // Check the result of the factory function
    expect(config).toBeInstanceOf(Config);
    expect(config.getUserMemory()).toBe(USER_MEMORY);
    expect(config.getApiKey()).toBe(API_KEY);
    expect(config.getUserAgent()).toBe(USER_AGENT);
  });

  it('createServerConfig should default userMemory if omitted', () => {
    const paramsWithoutMemory: ConfigParameters = { ...baseParams };
    delete paramsWithoutMemory.userMemory;
    const config = createServerConfig(paramsWithoutMemory);

    expect(config).toBeInstanceOf(Config);
    expect(config.getUserMemory()).toBe(''); // Should default to empty string
  });

  it('createServerConfig should resolve targetDir', () => {
    const relativeDir = './relative/path';
    const expectedResolvedDir = path.resolve(relativeDir);
    const paramsWithRelativeDir: ConfigParameters = {
      ...baseParams,
      targetDir: relativeDir,
    };
    const config = createServerConfig(paramsWithRelativeDir);
    expect(config.getTargetDir()).toBe(expectedResolvedDir);
  });

  it('createServerConfig should call setGeminiMdFilename with contextFileName if provided', () => {
    const contextFileName = 'CUSTOM_AGENTS.md';
    const paramsWithContextFile: ConfigParameters = {
      ...baseParams,
      contextFileName,
    };
    createServerConfig(paramsWithContextFile);
    expect(mockSetGeminiMdFilename).toHaveBeenCalledWith(contextFileName);
  });

  it('createServerConfig should not call setGeminiMdFilename if contextFileName is not provided', () => {
    createServerConfig(baseParams); // baseParams does not have contextFileName
    expect(mockSetGeminiMdFilename).not.toHaveBeenCalled();
  });

  it('Config constructor should call setGeminiMdFilename with contextFileName if provided', () => {
    const contextFileName = 'CUSTOM_AGENTS.md';
    const paramsWithContextFile: ConfigParameters = {
      ...baseParams,
      contextFileName,
    };
    new Config(paramsWithContextFile);
    expect(mockSetGeminiMdFilename).toHaveBeenCalledWith(contextFileName);
  });

  it('Config constructor should not call setGeminiMdFilename if contextFileName is not provided', () => {
    new Config(baseParams); // baseParams does not have contextFileName
    expect(mockSetGeminiMdFilename).not.toHaveBeenCalled();
  });

  it('should set default file filtering settings when not provided', () => {
    const config = new Config(baseParams);
    expect(config.getFileFilteringRespectGitIgnore()).toBe(true);
    expect(config.getFileFilteringAllowBuildArtifacts()).toBe(false);
  });

  it('should set custom file filtering settings when provided', () => {
    const paramsWithFileFiltering: ConfigParameters = {
      ...baseParams,
      fileFilteringRespectGitIgnore: false,
      fileFilteringAllowBuildArtifacts: true,
    };
    const config = new Config(paramsWithFileFiltering);
    expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
    expect(config.getFileFilteringAllowBuildArtifacts()).toBe(true);
  });

  it('Config constructor should set telemetry to true when provided as true', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: true,
    };
    const config = new Config(paramsWithTelemetry);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('Config constructor should set telemetry to false when provided as false', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: false,
    };
    const config = new Config(paramsWithTelemetry);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('Config constructor should default telemetry to default value if not provided', () => {
    const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
    delete paramsWithoutTelemetry.telemetry;
    const config = new Config(paramsWithoutTelemetry);
    expect(config.getTelemetryEnabled()).toBe(TELEMETRY);
  });

  it('createServerConfig should pass telemetry to Config constructor when true', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: true,
    };
    const config = createServerConfig(paramsWithTelemetry);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('createServerConfig should pass telemetry to Config constructor when false', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: false,
    };
    const config = createServerConfig(paramsWithTelemetry);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('createServerConfig should default telemetry (to false via Config constructor) if omitted', () => {
    const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
    delete paramsWithoutTelemetry.telemetry;
    const config = createServerConfig(paramsWithoutTelemetry);
    expect(config.getTelemetryEnabled()).toBe(TELEMETRY);
  });

  it('should have a getFileService method that returns FileDiscoveryService', async () => {
    const config = new Config(baseParams);
    const fileService = await config.getFileService();
    expect(fileService).toBeDefined();
  });
});
