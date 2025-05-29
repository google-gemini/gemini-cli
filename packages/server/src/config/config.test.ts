/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach /*, afterEach */ } from 'vitest'; // afterEach removed as it was unused
import { Config, createServerConfig, ConfigParameters } from './config.js'; // Adjust import path
import * as path from 'path';
// import { ToolRegistry } from '../tools/tool-registry'; // ToolRegistry removed as it was unused

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
});
