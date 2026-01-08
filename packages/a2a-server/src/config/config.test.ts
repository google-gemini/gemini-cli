/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';
import type { Settings } from './settings.js';
import type { ExtensionLoader } from '@google/gemini-cli-core';

// Mock dependencies
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    Config: vi.fn().mockImplementation((params) => ({
      initialize: vi.fn(),
      refreshAuth: vi.fn(),
      ...params, // Expose params for assertion
    })),
    loadServerHierarchicalMemory: vi
      .fn()
      .mockResolvedValue({ memoryContent: '', fileCount: 0 }),
    startupProfiler: {
      flush: vi.fn(),
    },
    FileDiscoveryService: vi.fn(),
  };
});

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('loadConfig', () => {
  const mockSettings = {} as Settings;
  const mockExtensionLoader = {} as ExtensionLoader;
  const taskId = 'test-task-id';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    delete process.env['CUSTOM_IGNORE_FILE_PATH'];
    delete process.env['GEMINI_API_KEY'];
  });

  it('should set customIgnoreFilePath when CUSTOM_IGNORE_FILE_PATH env var is present', async () => {
    const testPath = '/tmp/ignore';
    process.env['CUSTOM_IGNORE_FILE_PATH'] = testPath;
    const config = await loadConfig(mockSettings, mockExtensionLoader, taskId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((config as any).fileFiltering.customIgnoreFilePath).toBe(testPath);
  });

  it('should leave customIgnoreFilePath undefined when env var is missing', async () => {
    const config = await loadConfig(mockSettings, mockExtensionLoader, taskId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((config as any).fileFiltering.customIgnoreFilePath).toBeUndefined();
  });
});
