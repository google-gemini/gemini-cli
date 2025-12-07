/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, Config } from '@google/gemini-cli-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContentGeneratorConfig } from '@google/gemini-cli-core/core/contentGenerator';
import { GoogleGenAI } from '@google/genai';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(() => ({
    models: {},
  })),
}));

vi.mock('@google/gemini-cli-core/core/apiKeyCredentialStorage', () => ({
  loadApiKey: vi.fn(() => Promise.resolve(undefined)),
}));

describe('Gemini API Key Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_API_KEY', undefined);
  });

  it('should use geminiApiKey from Config when provided', async () => {
    const mockApiKey = 'TEST_API_KEY_FROM_CONFIG';
    const mockConfig = new Config({
      sessionId: 'test',
      targetDir: '/',
      debugMode: false,
      cwd: '/',
      model: 'gemini-pro',
      geminiApiKey: mockApiKey,
    });

    const contentGenConfig = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );

    expect(contentGenConfig.apiKey).toBe(mockApiKey);
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: mockApiKey,
      }),
    );
  });

  it('should prioritize GEMINI_API_KEY environment variable over loadedApiKey if config.geminiApiKey is not set', async () => {
    const envApiKey = 'TEST_API_KEY_FROM_ENV';
    vi.stubEnv('GEMINI_API_KEY', envApiKey);

    const loadApiKey = vi.mocked(
      (await vi.importActual(
        '@google/gemini-cli-core/core/apiKeyCredentialStorage',
      )) as { loadApiKey: () => Promise<string | undefined> },
    ).loadApiKey;
    loadApiKey.mockResolvedValueOnce('LOADED_API_KEY');

    const mockConfig = new Config({
      sessionId: 'test',
      targetDir: '/',
      debugMode: false,
      cwd: '/',
      model: 'gemini-pro',
    });

    const contentGenConfig = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );

    expect(contentGenConfig.apiKey).toBe(envApiKey);
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: envApiKey,
      }),
    );
    expect(loadApiKey).toHaveBeenCalled();
  });

  it('should prioritize loadedApiKey if config.geminiApiKey and GEMINI_API_KEY env are not set', async () => {
    const loadedApiKey = 'LOADED_API_KEY';
    const loadApiKey = vi.mocked(
      (await vi.importActual(
        '@google/gemini-cli-core/core/apiKeyCredentialStorage',
      )) as { loadApiKey: () => Promise<string | undefined> },
    ).loadApiKey;
    loadApiKey.mockResolvedValueOnce(loadedApiKey);

    const mockConfig = new Config({
      sessionId: 'test',
      targetDir: '/',
      debugMode: false,
      cwd: '/',
      model: 'gemini-pro',
    });

    const contentGenConfig = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );

    expect(contentGenConfig.apiKey).toBe(loadedApiKey);
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: loadedApiKey,
      }),
    );
    expect(loadApiKey).toHaveBeenCalled();
  });

  it('should not leak api key in proxy config', async () => {
    const mockApiKey = 'TEST_API_KEY_FROM_CONFIG';
    const mockConfig = new Config({
      sessionId: 'test',
      targetDir: '/',
      debugMode: false,
      cwd: '/',
      model: 'gemini-pro',
      geminiApiKey: mockApiKey,
      proxy: `http://user:${mockApiKey}@someproxy.com`,
    });

    const contentGenConfig = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );

    expect(contentGenConfig.proxy).toBe('http://user:***@someproxy.com');
  });
});
