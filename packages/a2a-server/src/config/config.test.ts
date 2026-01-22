/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';
import type { ExtensionLoader } from '@google/gemini-cli-core';
import type { Settings } from './settings.js';

const {
  mockLoadServerHierarchicalMemory,
  mockConfigConstructor,
  mockVerifyGitAvailability,
} = vi.hoisted(() => ({
  mockLoadServerHierarchicalMemory: vi.fn().mockResolvedValue({
    memoryContent: '',
    fileCount: 0,
    filePaths: [],
  }),
  mockConfigConstructor: vi.fn(),
  mockVerifyGitAvailability: vi.fn(),
}));

vi.mock('@google/gemini-cli-core', async () => ({
  Config: class MockConfig {
    constructor(params: unknown) {
      mockConfigConstructor(params);
    }
    initialize = vi.fn();
    refreshAuth = vi.fn();
  },
  loadServerHierarchicalMemory: mockLoadServerHierarchicalMemory,
  startupProfiler: {
    flush: vi.fn(),
  },
  FileDiscoveryService: vi.fn(),
  ApprovalMode: { DEFAULT: 'default', YOLO: 'yolo' },
  AuthType: {
    LOGIN_WITH_GOOGLE: 'login_with_google',
    USE_GEMINI: 'use_gemini',
  },
  GEMINI_DIR: '.gemini',
  DEFAULT_GEMINI_EMBEDDING_MODEL: 'models/embedding-001',
  DEFAULT_GEMINI_MODEL: 'models/gemini-1.5-flash',
  PREVIEW_GEMINI_MODEL: 'models/gemini-1.5-pro-latest',
  homedir: () => '/tmp',
  GitService: {
    verifyGitAvailability: mockVerifyGitAvailability,
  },
}));

describe('loadConfig', () => {
  const mockSettings = {
    checkpointing: { enabled: true },
  };
  const mockExtensionLoader = {
    start: vi.fn(),
    getExtensions: vi.fn().mockReturnValue([]),
  } as unknown as ExtensionLoader;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env['GEMINI_API_KEY'] = 'test-key';
    // Reset the mock return value just in case
    mockLoadServerHierarchicalMemory.mockResolvedValue({
      memoryContent: '',
      fileCount: 0,
      filePaths: [],
    });
  });

  afterEach(() => {
    delete process.env['GEMINI_API_KEY'];
    delete process.env['CHECKPOINTING'];
  });

  it('should disable checkpointing if git is not installed', async () => {
    mockVerifyGitAvailability.mockResolvedValue(false);

    await loadConfig(
      mockSettings as unknown as Settings,
      mockExtensionLoader,
      'test-task',
    );

    expect(mockConfigConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpointing: false,
      }),
    );
  });

  it('should enable checkpointing if git is installed', async () => {
    mockVerifyGitAvailability.mockResolvedValue(true);

    await loadConfig(
      mockSettings as unknown as Settings,
      mockExtensionLoader,
      'test-task',
    );

    expect(mockConfigConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpointing: true,
      }),
    );
  });
});
