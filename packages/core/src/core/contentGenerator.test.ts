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
  ContentGenerator,
} from './contentGenerator.js';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { GoogleGenAI } from '@google/genai';
import { Config } from '../config/config.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';

vi.mock('../code_assist/codeAssist.js');
vi.mock('@google/genai');

const mockConfig = {} as unknown as Config;

describe('createContentGenerator', () => {
  it('should create a CodeAssistContentGenerator', async () => {
    const mockGenerator = {} as unknown as ContentGenerator;
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
    expect(generator).toEqual(
      new LoggingContentGenerator(mockGenerator, mockConfig),
    );
  });

  it('should create a GoogleGenAI content generator', async () => {
    const mockGenerator = {
      models: {},
    } as unknown as GoogleGenAI;
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
    expect(generator).toEqual(
      new LoggingContentGenerator(
        (mockGenerator as GoogleGenAI).models,
        mockConfig,
      ),
    );
  });

  it('should create a GoogleGenAI content generator with custom baseUrl and apiKeyHeader', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'test-api-key',
        authType: AuthType.USE_GEMINI,
        baseUrl: 'https://custom.api.example.com',
        apiKeyHeader: 'X-Custom-API-Key',
      },
      mockConfig,
    );
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      vertexai: undefined,
      httpOptions: {
        baseUrl: 'https://custom.api.example.com',
        headers: {
          'User-Agent': expect.any(String),
          'X-Custom-API-Key': 'test-api-key',
        },
      },
    });
    expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  });

  it('should handle empty apiKey with custom headers', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator(
      {
        model: 'test-model',
        apiKey: '',
        authType: AuthType.USE_GEMINI,
        baseUrl: 'https://custom.api.example.com',
        apiKeyHeader: 'X-Custom-API-Key',
      },
      mockConfig,
    );
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: undefined,
      vertexai: undefined,
      httpOptions: {
        baseUrl: 'https://custom.api.example.com',
        headers: {
          'User-Agent': expect.any(String),
          'X-Custom-API-Key': '',
        },
      },
    });
    expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  });

  it('should correctly set header with special characters in header name and value', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'test-key-with-special-chars!@#$%',
        authType: AuthType.USE_GEMINI,
        apiKeyHeader: 'X-Custom-Header-Name',
      },
      mockConfig,
    );
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-key-with-special-chars!@#$%',
      vertexai: undefined,
      httpOptions: {
        headers: {
          'User-Agent': expect.any(String),
          'X-Custom-Header-Name': 'test-key-with-special-chars!@#$%',
        },
      },
    });
    expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  });

  it('should not set custom header when apiKeyHeader is undefined', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'test-api-key',
        authType: AuthType.USE_GEMINI,
        baseUrl: 'https://custom.api.example.com',
        // apiKeyHeader is undefined
      },
      mockConfig,
    );
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      vertexai: undefined,
      httpOptions: {
        baseUrl: 'https://custom.api.example.com',
        headers: {
          'User-Agent': expect.any(String),
          // No custom header should be added
        },
      },
    });
    expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  });

  it('should handle header value with special characters correctly', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'api-key-with-special-chars-123',
        authType: AuthType.USE_GEMINI,
        apiKeyHeader: 'Authorization',
      },
      mockConfig,
    );
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'api-key-with-special-chars-123',
      vertexai: undefined,
      httpOptions: {
        headers: {
          'User-Agent': expect.any(String),
          'Authorization': 'api-key-with-special-chars-123',
        },
      },
    });
    expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  });

  it('should handle header value with quotes correctly', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'api-key-with-"quotes"-and-other-chars',
        authType: AuthType.USE_GEMINI,
        apiKeyHeader: 'Authorization',
      },
      mockConfig,
    );
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'api-key-with-"quotes"-and-other-chars',
      vertexai: undefined,
      httpOptions: {
        headers: {
          'User-Agent': expect.any(String),
          'Authorization': 'api-key-with-"quotes"-and-other-chars',
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

  it('should configure custom baseUrl from BASE_URL environment variable for Gemini', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.BASE_URL = 'https://custom.gemini.example.com';
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.baseUrl).toBe('https://custom.gemini.example.com');
    expect(config.apiKey).toBe('test-key');
    expect(config.vertexai).toBe(false);
  });

  it('should configure custom apiKeyHeader from API_KEY_HEADER environment variable for Gemini', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.API_KEY_HEADER = 'X-Custom-Auth';
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.apiKeyHeader).toBe('X-Custom-Auth');
    expect(config.apiKey).toBe('test-key');
    expect(config.vertexai).toBe(false);
  });

  it('should configure both custom baseUrl and apiKeyHeader for Gemini', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.BASE_URL = 'https://custom.gemini.example.com';
    process.env.API_KEY_HEADER = 'X-Custom-Auth';
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.baseUrl).toBe('https://custom.gemini.example.com');
    expect(config.apiKeyHeader).toBe('X-Custom-Auth');
    expect(config.apiKey).toBe('test-key');
    expect(config.vertexai).toBe(false);
  });

  it('should not set baseUrl or apiKeyHeader if environment variables are not set', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.BASE_URL;
    delete process.env.API_KEY_HEADER;
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.baseUrl).toBeUndefined();
    expect(config.apiKeyHeader).toBeUndefined();
    expect(config.apiKey).toBe('test-key');
    expect(config.vertexai).toBe(false);
  });

  it('should not set custom configuration for LOGIN_WITH_GOOGLE auth type', async () => {
    process.env.BASE_URL = 'https://custom.example.com';
    process.env.API_KEY_HEADER = 'X-Custom-Auth';
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(config.baseUrl).toBeUndefined();
    expect(config.apiKeyHeader).toBeUndefined();
    expect(config.apiKey).toBeUndefined();
    expect(config.vertexai).toBeUndefined();
  });
});

describe('custom header validation', () => {
  const mockConfig = {} as unknown as Config;

  it('should validate that custom header is correctly applied to httpOptions', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation((options) => {
      // Validate that the httpOptions contain the expected custom header
      const expectedHeaders = {
        'User-Agent': expect.any(String),
        'X-Custom-Authorization': 'bearer-token-123',
      };
      expect(options?.httpOptions?.headers).toEqual(expectedHeaders);
      return mockGenerator as never;
    });

    await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'bearer-token-123',
        authType: AuthType.USE_GEMINI,
        apiKeyHeader: 'X-Custom-Authorization',
      },
      mockConfig,
    );
  });

  it('should validate that multiple custom configurations are applied correctly', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation((options) => {
      // Validate that both baseUrl and custom header are applied
      expect(options?.httpOptions?.baseUrl).toBe('https://api.custom.endpoint');
      const expectedHeaders = {
        'User-Agent': expect.any(String),
        'X-API-Key': 'custom-api-key-xyz',
      };
      expect(options?.httpOptions?.headers).toEqual(expectedHeaders);
      return mockGenerator as never;
    });

    await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'custom-api-key-xyz',
        authType: AuthType.USE_GEMINI,
        baseUrl: 'https://api.custom.endpoint',
        apiKeyHeader: 'X-API-Key',
      },
      mockConfig,
    );
  });

  it('should validate header JSON parsing with complex header names', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation((options) => {
      const expectedHeaders = {
        'User-Agent': expect.any(String),
        'X-Complex-Header-Name-With-Dashes': 'test-value',
      };
      expect(options?.httpOptions?.headers).toEqual(expectedHeaders);
      return mockGenerator as never;
    });

    await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'test-value',
        authType: AuthType.USE_GEMINI,
        apiKeyHeader: 'X-Complex-Header-Name-With-Dashes',
      },
      mockConfig,
    );
  });

  it('should validate that User-Agent header is preserved when custom header is added', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    let capturedHeaders: Record<string, string> = {};
    
    vi.mocked(GoogleGenAI).mockImplementation((options) => {
      capturedHeaders = options?.httpOptions?.headers || {};
      return mockGenerator as never;
    });

    await createContentGenerator(
      {
        model: 'test-model',
        apiKey: 'test-api-key',
        authType: AuthType.USE_GEMINI,
        apiKeyHeader: 'Authorization',
      },
      mockConfig,
    );

    // Validate that both User-Agent and custom header exist
    expect(capturedHeaders).toHaveProperty('User-Agent');
    expect(capturedHeaders).toHaveProperty('Authorization');
    expect(capturedHeaders['Authorization']).toBe('test-api-key');
    expect(capturedHeaders['User-Agent']).toMatch(/GeminiCLI/);
  });
});
