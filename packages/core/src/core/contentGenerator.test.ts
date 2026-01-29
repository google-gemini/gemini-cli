/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContentGenerator } from './contentGenerator.js';
import {
  createContentGenerator,
  AuthType,
  createContentGeneratorConfig,
} from './contentGenerator.js';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { GoogleGenAI } from '@google/genai';
import type { Config } from '../config/config.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { loadApiKey } from './apiKeyCredentialStorage.js';
import { FakeContentGenerator } from './fakeContentGenerator.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';

vi.mock('../code_assist/codeAssist.js');
vi.mock('@google/genai');
vi.mock('./apiKeyCredentialStorage.js', () => ({
  loadApiKey: vi.fn(),
}));

vi.mock('./fakeContentGenerator.js');

const mockConfig = {
  getModel: vi.fn().mockReturnValue('gemini-pro'),
  getProxy: vi.fn().mockReturnValue(undefined),
  getUsageStatisticsEnabled: vi.fn().mockReturnValue(true),
  getPreviewFeatures: vi.fn().mockReturnValue(false),
} as unknown as Config;

describe('createContentGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should create a FakeContentGenerator', async () => {
    const mockGenerator = {} as unknown as ContentGenerator;
    vi.mocked(FakeContentGenerator.fromFile).mockResolvedValue(
      mockGenerator as never,
    );
    const fakeResponsesFile = 'fake/responses.yaml';
    const mockConfigWithFake = {
      fakeResponses: fakeResponsesFile,
    } as unknown as Config;
    const generator = await createContentGenerator(
      {
        authType: AuthType.USE_GEMINI,
      },
      mockConfigWithFake,
    );
    expect(FakeContentGenerator.fromFile).toHaveBeenCalledWith(
      fakeResponsesFile,
    );
    expect(generator).toEqual(
      new LoggingContentGenerator(mockGenerator, mockConfigWithFake),
    );
  });

  it('should create a RecordingContentGenerator', async () => {
    const fakeResponsesFile = 'fake/responses.yaml';
    const recordResponsesFile = 'record/responses.yaml';
    const mockConfigWithRecordResponses = {
      fakeResponses: fakeResponsesFile,
      recordResponses: recordResponsesFile,
    } as unknown as Config;
    const generator = await createContentGenerator(
      {
        authType: AuthType.USE_GEMINI,
      },
      mockConfigWithRecordResponses,
    );
    expect(generator).toBeInstanceOf(RecordingContentGenerator);
  });

  it('should create a CodeAssistContentGenerator when AuthType is LOGIN_WITH_GOOGLE', async () => {
    const mockGenerator = {} as unknown as ContentGenerator;
    vi.mocked(createCodeAssistContentGenerator).mockResolvedValue(
      mockGenerator as never,
    );
    const generator = await createContentGenerator(
      {
        authType: AuthType.LOGIN_WITH_GOOGLE,
      },
      mockConfig,
    );
    expect(createCodeAssistContentGenerator).toHaveBeenCalled();
    expect(generator).toEqual(
      new LoggingContentGenerator(mockGenerator, mockConfig),
    );
  });

  it('should create a CodeAssistContentGenerator when AuthType is COMPUTE_ADC', async () => {
    const mockGenerator = {} as unknown as ContentGenerator;
    vi.mocked(createCodeAssistContentGenerator).mockResolvedValue(
      mockGenerator as never,
    );
    const generator = await createContentGenerator(
      {
        authType: AuthType.COMPUTE_ADC,
      },
      mockConfig,
    );
    expect(createCodeAssistContentGenerator).toHaveBeenCalled();
    expect(generator).toEqual(
      new LoggingContentGenerator(mockGenerator, mockConfig),
    );
  });

  it('should create a GoogleGenAI content generator', async () => {
    const mockConfig = {
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getProxy: vi.fn().mockReturnValue(undefined),
      getUsageStatisticsEnabled: () => true,
      getPreviewFeatures: vi.fn().mockReturnValue(false),
    } as unknown as Config;

    // Set a fixed version for testing
    vi.stubEnv('CLI_VERSION', '1.2.3');

    const mockGenerator = {
      models: {},
    } as unknown as GoogleGenAI;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator(
      {
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
          'User-Agent': expect.stringContaining('GeminiCLI/1.2.3/gemini-pro'),
          'x-gemini-api-privileged-user-id': expect.any(String),
        },
      },
    });
    expect(generator).toEqual(
      new LoggingContentGenerator(mockGenerator.models, mockConfig),
    );
  });

  it('should include custom headers from GEMINI_CLI_CUSTOM_HEADERS for Code Assist requests', async () => {
    const mockGenerator = {} as unknown as ContentGenerator;
    vi.mocked(createCodeAssistContentGenerator).mockResolvedValue(
      mockGenerator as never,
    );
    vi.stubEnv(
      'GEMINI_CLI_CUSTOM_HEADERS',
      'X-Test-Header: test-value, Another-Header: another value',
    );

    await createContentGenerator(
      {
        authType: AuthType.LOGIN_WITH_GOOGLE,
      },
      mockConfig,
    );

    expect(createCodeAssistContentGenerator).toHaveBeenCalledWith(
      {
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
          'X-Test-Header': 'test-value',
          'Another-Header': 'another value',
        }),
      },
      AuthType.LOGIN_WITH_GOOGLE,
      mockConfig,
      undefined,
    );
  });

  it('should include custom headers from GEMINI_CLI_CUSTOM_HEADERS for GoogleGenAI requests without inferring auth mechanism', async () => {
    const mockConfig = {
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getProxy: vi.fn().mockReturnValue(undefined),
      getUsageStatisticsEnabled: () => false,
      getPreviewFeatures: vi.fn().mockReturnValue(false),
    } as unknown as Config;

    const mockGenerator = {
      models: {},
    } as unknown as GoogleGenAI;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    vi.stubEnv(
      'GEMINI_CLI_CUSTOM_HEADERS',
      'X-Test-Header: test, Another: value',
    );

    await createContentGenerator(
      {
        apiKey: 'test-api-key',
        authType: AuthType.USE_GEMINI,
      },
      mockConfig,
    );

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      vertexai: undefined,
      httpOptions: {
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
          'X-Test-Header': 'test',
          Another: 'value',
        }),
      },
    });
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.not.objectContaining({
        httpOptions: {
          headers: expect.objectContaining({
            Authorization: expect.any(String),
          }),
        },
      }),
    );
  });

  it('should pass api key as Authorization Header when GEMINI_API_KEY_AUTH_MECHANISM is set to bearer', async () => {
    const mockConfig = {
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getProxy: vi.fn().mockReturnValue(undefined),
      getUsageStatisticsEnabled: () => false,
      getPreviewFeatures: vi.fn().mockReturnValue(false),
    } as unknown as Config;

    const mockGenerator = {
      models: {},
    } as unknown as GoogleGenAI;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    vi.stubEnv('GEMINI_API_KEY_AUTH_MECHANISM', 'bearer');

    await createContentGenerator(
      {
        apiKey: 'test-api-key',
        authType: AuthType.USE_GEMINI,
      },
      mockConfig,
    );

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      vertexai: undefined,
      httpOptions: {
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
          Authorization: 'Bearer test-api-key',
        }),
      },
    });
  });

  it('should not pass api key as Authorization Header when GEMINI_API_KEY_AUTH_MECHANISM is not set (default behavior)', async () => {
    const mockConfig = {
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getProxy: vi.fn().mockReturnValue(undefined),
      getUsageStatisticsEnabled: () => false,
      getPreviewFeatures: vi.fn().mockReturnValue(false),
    } as unknown as Config;

    const mockGenerator = {
      models: {},
    } as unknown as GoogleGenAI;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    // GEMINI_API_KEY_AUTH_MECHANISM is not stubbed, so it will be undefined, triggering default 'x-goog-api-key'

    await createContentGenerator(
      {
        apiKey: 'test-api-key',
        authType: AuthType.USE_GEMINI,
      },
      mockConfig,
    );

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      vertexai: undefined,
      httpOptions: {
        headers: expect.objectContaining({
          'User-Agent': expect.any(String),
        }),
      },
    });
    // Explicitly assert that Authorization header is NOT present
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.not.objectContaining({
        httpOptions: {
          headers: expect.objectContaining({
            Authorization: expect.any(String),
          }),
        },
      }),
    );
  });

  it('should create a GoogleGenAI content generator with client install id logging disabled', async () => {
    const mockConfig = {
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getUsageStatisticsEnabled: () => false,
      getPreviewFeatures: vi.fn().mockReturnValue(false),
    } as unknown as Config;
    const mockGenerator = {
      models: {},
    } as unknown as GoogleGenAI;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator(
      {
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
      new LoggingContentGenerator(mockGenerator.models, mockConfig),
    );
  });
});

describe('createContentGeneratorConfig', () => {
  const mockConfig = {
    getModel: vi.fn().mockReturnValue('gemini-pro'),
    setModel: vi.fn(),
    flashFallbackHandler: vi.fn(),
    getProxy: vi.fn(),
  } as unknown as Config;

  beforeEach(() => {
    // Reset modules to re-evaluate imports and environment variables
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should configure for Gemini using GEMINI_API_KEY when set', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'env-gemini-key');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.apiKey).toBe('env-gemini-key');
    expect(config.vertexai).toBe(false);
  });

  it('should not configure for Gemini if GEMINI_API_KEY is empty', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.apiKey).toBeUndefined();
    expect(config.vertexai).toBeUndefined();
  });

  it('should not configure for Gemini if GEMINI_API_KEY is not set and storage is empty', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.mocked(loadApiKey).mockResolvedValue(null);
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_GEMINI,
    );
    expect(config.apiKey).toBeUndefined();
    expect(config.vertexai).toBeUndefined();
  });

  it('should configure for Vertex AI using GOOGLE_API_KEY when set', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'env-google-key');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI,
    );
    expect(config.apiKey).toBe('env-google-key');
    expect(config.vertexai).toBe(true);
  });

  it('should configure for Vertex AI using GCP project and location when set', async () => {
    vi.stubEnv('GOOGLE_API_KEY', undefined);
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'env-gcp-project');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', 'env-gcp-location');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI,
    );
    expect(config.vertexai).toBe(true);
    expect(config.apiKey).toBeUndefined();
  });

  it('should not configure for Vertex AI if required env vars are empty', async () => {
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('GOOGLE_CLOUD_PROJECT', '');
    vi.stubEnv('GOOGLE_CLOUD_LOCATION', '');
    const config = await createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_VERTEX_AI,
    );
    expect(config.apiKey).toBeUndefined();
    expect(config.vertexai).toBeUndefined();
  });
});
