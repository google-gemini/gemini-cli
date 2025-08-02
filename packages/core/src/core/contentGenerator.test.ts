/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  createContentGenerator,
  AuthType,
  createContentGeneratorConfig,
} from './contentGenerator.js';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { GoogleGenAI } from '@google/genai';
import { Config } from '../config/config.js';
import { DEFAULT_DATABRICKS_MODEL } from '../config/models.js';

vi.mock('../code_assist/codeAssist.js');
vi.mock('@google/genai');

const mockConfig = {} as unknown as Config;

describe('createContentGenerator', () => {
  it('should create a CodeAssistContentGenerator', async () => {
    const mockGenerator = {} as unknown;
    vi.mocked(createCodeAssistContentGenerator).mockResolvedValue(
      mockGenerator as never,
    );
    const generator = await createContentGenerator(
      {
        model: 'test-model',
        authType: AuthType.LOGIN_WITH_GOOGLE,
      },
      mockConfig,
    );
    expect(createCodeAssistContentGenerator).toHaveBeenCalled();
    expect(generator).toBe(mockGenerator);
  });

  it('should create a GoogleGenAI content generator', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'test-api-key',
        authType: AuthType.USE_GEMINI,
      },
      mockConfig,
    );
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      vertexai: undefined,
      httpOptions: {
        headers: {
          'User-Agent': expect.any(String),
        },
      },
    });
    expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  });
});

describe('createContentGeneratorConfig', () => {
  const originalEnv = process.env;
  const mockConfig = {
    getModel: vi.fn().mockReturnValue('gemini-pro'),
    setModel: vi.fn(),
    flashFallbackHandler: vi.fn(),
    getProxy: vi.fn(),
  } as unknown as Config;

  beforeEach(() => {
    // Reset modules to re-evaluate imports and environment variables
    vi.resetModules();
    // Restore process.env before each test
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Restore original process.env after all tests
    process.env = originalEnv;
  });

  it('should configure for Gemini using GEMINI_API_KEY when set', async () => {
    process.env.GEMINI_API_KEY = 'env-gemini-key';
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.apiKey).toBe('env-gemini-key');
    expect(config.vertexai).toBe(false);
  });

  it('should not configure for Gemini if GEMINI_API_KEY is empty', async () => {
    process.env.GEMINI_API_KEY = '';
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.apiKey).toBeUndefined();
    expect(config.vertexai).toBeUndefined();
  });

  it('should configure for Vertex AI using GOOGLE_API_KEY when set', async () => {
    process.env.GOOGLE_API_KEY = 'env-google-key';
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI,
    );
    expect(config.apiKey).toBe('env-google-key');
    expect(config.vertexai).toBe(true);
  });

  it('should configure for Vertex AI using GCP project and location when set', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'env-gcp-project';
    process.env.GOOGLE_CLOUD_LOCATION = 'env-gcp-location';
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI,
    );
    expect(config.vertexai).toBe(true);
    expect(config.apiKey).toBeUndefined();
  });

  it('should not configure for Vertex AI if required env vars are empty', async () => {
    process.env.GOOGLE_API_KEY = '';
    process.env.GOOGLE_CLOUD_PROJECT = '';
    process.env.GOOGLE_CLOUD_LOCATION = '';
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI,
    );
    expect(config.apiKey).toBeUndefined();
    expect(config.vertexai).toBeUndefined();
  });

  describe('Databricks model configuration', () => {
    it('should default to databricks-claude-sonnet-4 when using Databricks auth and no model is configured', async () => {
      // Given: Databricks environment variables are set
      process.env.DATABRICKS_URL = 'https://example.databricks.com';
      process.env.DBX_PAT = 'test-databricks-token';

      // And: No model is configured in the config
      const mockConfigNoModel = {
        getModel: vi.fn().mockReturnValue(null),
        setModel: vi.fn(),
        flashFallbackHandler: vi.fn(),
        getProxy: vi.fn(),
      } as unknown as Config;

      // When: Creating content generator config with Databricks auth
      const config = await createContentGeneratorConfig(
        mockConfigNoModel,
        AuthType.USE_DATABRICKS,
      );

      // Then: The model should be set to the default Databricks model
      expect(config.model).toBe('databricks-claude-sonnet-4');
      expect(config.model).toBe(DEFAULT_DATABRICKS_MODEL);
      expect(config.authType).toBe(AuthType.USE_DATABRICKS);
    });

    it('should use configured model when using Databricks auth and model is set', async () => {
      // Given: Databricks environment variables are set
      process.env.DATABRICKS_URL = 'https://example.databricks.com';
      process.env.DBX_PAT = 'test-databricks-token';

      // And: A specific model is configured
      const customModel = 'databricks-claude-opus-4';
      const mockConfigWithModel = {
        getModel: vi.fn().mockReturnValue(customModel),
        setModel: vi.fn(),
        flashFallbackHandler: vi.fn(),
        getProxy: vi.fn(),
      } as unknown as Config;

      // When: Creating content generator config with Databricks auth
      const config = await createContentGeneratorConfig(
        mockConfigWithModel,
        AuthType.USE_DATABRICKS,
      );

      // Then: The configured model should be used, not the default
      expect(config.model).toBe(customModel);
      expect(config.authType).toBe(AuthType.USE_DATABRICKS);
    });

    it('should still return config even when Databricks environment variables are missing', async () => {
      // Given: Databricks environment variables are not set
      delete process.env.DATABRICKS_URL;
      delete process.env.DBX_PAT;

      // And: No model is configured
      const mockConfigNoModel = {
        getModel: vi.fn().mockReturnValue(null),
        setModel: vi.fn(),
        flashFallbackHandler: vi.fn(),
        getProxy: vi.fn(),
      } as unknown as Config;

      // When: Creating content generator config with Databricks auth
      const config = await createContentGeneratorConfig(
        mockConfigNoModel,
        AuthType.USE_DATABRICKS,
      );

      // Then: Config is returned with default model (validation happens later in createContentGenerator)
      expect(config.model).toBe('databricks-claude-sonnet-4');
      expect(config.model).toBe(DEFAULT_DATABRICKS_MODEL);
      expect(config.authType).toBe(AuthType.USE_DATABRICKS);
    });
  });
});
