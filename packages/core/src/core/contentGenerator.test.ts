/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createContentGenerator,
  createContentGeneratorConfig,
  AuthType,
} from './contentGenerator.js';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { GoogleGenAI } from '@google/genai';
import * as modelCheck from './modelCheck.js';

vi.mock('../code_assist/codeAssist.js');
vi.mock('@google/genai');
vi.mock('./modelCheck.js');

describe('createContentGeneratorConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(modelCheck, 'getEffectiveModel').mockResolvedValue(
      'mock-effective-model',
    );
    process.env = { ...originalEnv }; // Make a copy of process.env
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv; // Restore original process.env
  });

  it('should return config for LOGIN_WITH_GOOGLE without further validation', async () => {
    const config = await createContentGeneratorConfig(
      'test-model',
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(config).toEqual({
      model: 'test-model',
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });
  });

  it('should use GEMINI_API_KEY from process.env for USE_GEMINI', async () => {
    process.env.GEMINI_API_KEY = 'env-gemini-key';
    const config = await createContentGeneratorConfig(
      'test-model',
      AuthType.USE_GEMINI,
    );
    expect(config.authType).toBe(AuthType.USE_GEMINI);
    expect(config.auth?.gemini?.apiKey).toBe('env-gemini-key');
    expect(config.model).toBe('mock-effective-model');
  });

  it('should use GEMINI_API_KEY from auth settings for USE_GEMINI', async () => {
    const config = await createContentGeneratorConfig(
      'test-model',
      AuthType.USE_GEMINI,
      { getAuth: () => ({ gemini: { apiKey: 'settings-gemini-key' } }) },
    );
    expect(config.authType).toBe(AuthType.USE_GEMINI);
    expect(config.auth?.gemini?.apiKey).toBe('settings-gemini-key');
    expect(config.model).toBe('mock-effective-model');
  });

  it('should use GOOGLE_API_KEY from process.env for USE_VERTEX_AI', async () => {
    process.env.GOOGLE_API_KEY = 'env-google-key';
    const config = await createContentGeneratorConfig(
      'test-model',
      AuthType.USE_VERTEX_AI,
    );
    expect(config.authType).toBe(AuthType.USE_VERTEX_AI);
    expect(config.auth?.vertex?.apiKey).toBe('env-google-key');
    expect(config.model).toBe('mock-effective-model');
  });

  it('should use GOOGLE_API_KEY from auth settings for USE_VERTEX_AI', async () => {
    const config = await createContentGeneratorConfig(
      'test-model',
      AuthType.USE_VERTEX_AI,
      { getAuth: () => ({ vertex: { apiKey: 'settings-google-key' } }) },
    );
    expect(config.authType).toBe(AuthType.USE_VERTEX_AI);
    expect(config.auth?.vertex?.apiKey).toBe('settings-google-key');
    expect(config.model).toBe('mock-effective-model');
  });

  it('should use GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION from process.env for USE_VERTEX_AI', async () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'env-project';
    process.env.GOOGLE_CLOUD_LOCATION = 'env-location';
    const config = await createContentGeneratorConfig(
      'test-model',
      AuthType.USE_VERTEX_AI,
    );
    expect(config.authType).toBe(AuthType.USE_VERTEX_AI);
    expect(config.auth?.vertex?.project).toBe('env-project');
    expect(config.auth?.vertex?.location).toBe('env-location');
    expect(config.model).toBe('test-model'); // modelCheck.getEffectiveModel is not called for project/location auth
  });

  it('should use GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION from auth settings for USE_VERTEX_AI', async () => {
    const config = await createContentGeneratorConfig(
      'test-model',
      AuthType.USE_VERTEX_AI,
      {
        getAuth: () => ({
          vertex: {
            project: 'settings-project',
            location: 'settings-location',
          },
        }),
      },
    );
    expect(config.authType).toBe(AuthType.USE_VERTEX_AI);
    expect(config.auth?.vertex?.project).toBe('settings-project');
    expect(config.auth?.vertex?.location).toBe('settings-location');
    expect(config.model).toBe('test-model'); // modelCheck.getEffectiveModel is not called for project/location auth
  });

  it('should return config without auth if no valid auth is provided', async () => {
    const config = await createContentGeneratorConfig(
      'test-model',
      AuthType.USE_GEMINI,
    );
    expect(config.auth).toBeUndefined();
  });
});

describe('createContentGenerator', () => {
  it('should create a CodeAssistContentGenerator', async () => {
    const mockGenerator = {} as unknown;
    vi.mocked(createCodeAssistContentGenerator).mockResolvedValue(
      mockGenerator as never,
    );
    const generator = await createContentGenerator({
      model: 'test-model',
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });
    expect(createCodeAssistContentGenerator).toHaveBeenCalled();
    expect(generator).toBe(mockGenerator);
  });

  it('should create a GoogleGenAI content generator for gemini', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator({
      model: 'test-model',
      authType: AuthType.USE_GEMINI,
      auth: { gemini: { apiKey: 'test-api-key' } },
    });
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

  it('should create a GoogleGenAI content generator for vertex AI with key', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator({
      model: 'test-model',
      authType: AuthType.USE_VERTEX_AI,
      auth: { vertex: { apiKey: 'test-api-key' } },
    });
    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      vertexai: true,
      httpOptions: {
        headers: {
          'User-Agent': expect.any(String),
        },
      },
    });
    expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  });

  it('should create a GoogleGenAI content generator for vertex AI', async () => {
    const mockGenerator = {
      models: {},
    } as unknown;
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGenerator as never);
    const generator = await createContentGenerator({
      model: 'test-model',
      authType: AuthType.USE_VERTEX_AI,
      auth: { vertex: { project: 'my-project', location: 'my-location' } },
    });
    expect(GoogleGenAI).toHaveBeenCalledWith({
      vertexai: true,
      project: 'my-project',
      location: 'my-location',
      httpOptions: {
        headers: {
          'User-Agent': expect.any(String),
        },
      },
    });
    expect(generator).toBe((mockGenerator as GoogleGenAI).models);
  });
});
