/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import {
  AuthType,
  OutputFormat,
  makeFakeConfig,
  debugLogger,
  ExitCodes,
  coreEvents,
} from '@google/gemini-cli-core';
import type { Config } from '@google/gemini-cli-core';
import * as auth from './config/auth.js';
import { type LoadedSettings } from './config/settings.js';

function createLocalMockConfig(overrides: Partial<Config> = {}): Config {
  const config = makeFakeConfig();
  Object.assign(config, overrides);
  return config;
}

describe('validateNonInterActiveAuth', () => {
  let originalEnvGeminiApiKey: string | undefined;
  let originalEnvVertexAi: string | undefined;
  let originalEnvGcp: string | undefined;
  let originalEnvLocalBackend: string | undefined;
  let originalOllamaHost: string | undefined;
  let originalLmStudioApiBase: string | undefined;
  let originalLlamaCppServerBase: string | undefined;
  let originalVllmApiBase: string | undefined;
  let originalSglangApiBase: string | undefined;
  let debugLoggerErrorSpy: ReturnType<typeof vi.spyOn>;
  let coreEventsEmitFeedbackSpy: MockInstance;
  let processExitSpy: MockInstance;
  let mockSettings: LoadedSettings;

  beforeEach(() => {
    originalEnvGeminiApiKey = process.env['GEMINI_API_KEY'];
    originalEnvVertexAi = process.env['GOOGLE_GENAI_USE_VERTEXAI'];
    originalEnvGcp = process.env['GOOGLE_GENAI_USE_GCA'];
    originalEnvLocalBackend = process.env['GEMINI_LOCAL_BACKEND'];
    originalOllamaHost = process.env['OLLAMA_HOST'];
    originalLmStudioApiBase = process.env['LM_STUDIO_API_BASE'];
    originalLlamaCppServerBase = process.env['LLAMA_CPP_SERVER_BASE'];
    originalVllmApiBase = process.env['VLLM_API_BASE'];
    originalSglangApiBase = process.env['SGLANG_API_BASE'];
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_GENAI_USE_VERTEXAI'];
    delete process.env['GOOGLE_GENAI_USE_GCA'];
    delete process.env['GEMINI_LOCAL_BACKEND'];
    delete process.env['OLLAMA_HOST'];
    delete process.env['LM_STUDIO_API_BASE'];
    delete process.env['LLAMA_CPP_SERVER_BASE'];
    delete process.env['VLLM_API_BASE'];
    delete process.env['SGLANG_API_BASE'];
    debugLoggerErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});
    coreEventsEmitFeedbackSpy = vi
      .spyOn(coreEvents, 'emitFeedback')
      .mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit(${code}) called`);
      });
    vi.spyOn(auth, 'validateAuthMethod').mockResolvedValue(null);
    mockSettings = {
      system: { path: '', settings: {} },
      systemDefaults: { path: '', settings: {} },
      user: { path: '', settings: {} },
      workspace: { path: '', settings: {} },
      errors: [],
      setValue: vi.fn(),
      merged: {
        security: {
          auth: {
            enforcedType: undefined,
          },
        },
      },
      isTrusted: true,
      migratedInMemoryScopes: new Set(),
      forScope: vi.fn(),
      computeMergedSettings: vi.fn(),
    } as unknown as LoadedSettings;
  });

  afterEach(() => {
    if (originalEnvGeminiApiKey !== undefined) {
      process.env['GEMINI_API_KEY'] = originalEnvGeminiApiKey;
    } else {
      delete process.env['GEMINI_API_KEY'];
    }
    if (originalEnvVertexAi !== undefined) {
      process.env['GOOGLE_GENAI_USE_VERTEXAI'] = originalEnvVertexAi;
    } else {
      delete process.env['GOOGLE_GENAI_USE_VERTEXAI'];
    }
    if (originalEnvGcp !== undefined) {
      process.env['GOOGLE_GENAI_USE_GCA'] = originalEnvGcp;
    } else {
      delete process.env['GOOGLE_GENAI_USE_GCA'];
    }
    if (originalEnvLocalBackend !== undefined) {
      process.env['GEMINI_LOCAL_BACKEND'] = originalEnvLocalBackend;
    } else {
      delete process.env['GEMINI_LOCAL_BACKEND'];
    }
    if (originalOllamaHost !== undefined) {
      process.env['OLLAMA_HOST'] = originalOllamaHost;
    } else {
      delete process.env['OLLAMA_HOST'];
    }
    if (originalLmStudioApiBase !== undefined) {
      process.env['LM_STUDIO_API_BASE'] = originalLmStudioApiBase;
    } else {
      delete process.env['LM_STUDIO_API_BASE'];
    }
    if (originalLlamaCppServerBase !== undefined) {
      process.env['LLAMA_CPP_SERVER_BASE'] = originalLlamaCppServerBase;
    } else {
      delete process.env['LLAMA_CPP_SERVER_BASE'];
    }
    if (originalVllmApiBase !== undefined) {
      process.env['VLLM_API_BASE'] = originalVllmApiBase;
    } else {
      delete process.env['VLLM_API_BASE'];
    }
    if (originalSglangApiBase !== undefined) {
      process.env['SGLANG_API_BASE'] = originalSglangApiBase;
    } else {
      delete process.env['SGLANG_API_BASE'];
    }
    vi.restoreAllMocks();
  });

  it('exits if no auth type is configured or env vars set', async () => {
    const nonInteractiveConfig = createLocalMockConfig({
      getOutputFormat: vi.fn().mockReturnValue(OutputFormat.TEXT),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue({ authType: undefined }),
    });
    try {
      await validateNonInteractiveAuth(
        undefined,
        undefined,
        nonInteractiveConfig,
        mockSettings,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain(
        `process.exit(${ExitCodes.FATAL_AUTHENTICATION_ERROR}) called`,
      );
    }
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Please set an Auth method'),
    );
    expect(processExitSpy).toHaveBeenCalledWith(
      ExitCodes.FATAL_AUTHENTICATION_ERROR,
    );
  });

  it('uses LOGIN_WITH_GOOGLE if GOOGLE_GENAI_USE_GCA is set', async () => {
    process.env['GOOGLE_GENAI_USE_GCA'] = 'true';
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('uses USE_GEMINI if GEMINI_API_KEY is set', async () => {
    process.env['GEMINI_API_KEY'] = 'fake-key';
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('accepts USE_LOCAL_OLLAMA when configured explicitly', async () => {
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      AuthType.USE_LOCAL_OLLAMA,
      true,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('accepts all five local backend auth types without error', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const localAuthTypes = [
      AuthType.USE_LOCAL_OLLAMA,
      AuthType.USE_LOCAL_LM_STUDIO,
      AuthType.USE_LOCAL_LLAMA_CPP,
      AuthType.USE_LOCAL_VLLM,
      AuthType.USE_LOCAL_SGLANG,
    ];

    for (const authType of localAuthTypes) {
      const nonInteractiveConfig = createLocalMockConfig({});
      await validateNonInteractiveAuth(
        authType,
        true,
        nonInteractiveConfig,
        mockSettings,
      );
      expect(processExitSpy).not.toHaveBeenCalled();
    }
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('detects local backend from env var and passes with healthy backend', async () => {
    process.env['GEMINI_LOCAL_BACKEND'] = 'ollama';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const nonInteractiveConfig = createLocalMockConfig({});

    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );

    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/v1/models'),
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    );
    fetchSpy.mockRestore();
  });

  it('exits when local backend is not running (health check fails)', async () => {
    process.env['GEMINI_LOCAL_BACKEND'] = 'ollama';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const nonInteractiveConfig = createLocalMockConfig({
      getOutputFormat: vi.fn().mockReturnValue(OutputFormat.TEXT),
    });

    try {
      await validateNonInteractiveAuth(
        undefined,
        undefined,
        nonInteractiveConfig,
        mockSettings,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain(
        `process.exit(${ExitCodes.FATAL_AUTHENTICATION_ERROR}) called`,
      );
    }

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ollama is not running at'),
    );
    expect(processExitSpy).toHaveBeenCalledWith(
      ExitCodes.FATAL_AUTHENTICATION_ERROR,
    );
    fetchSpy.mockRestore();
  });

  it('exits when local backend returns non-200 status', async () => {
    process.env['GEMINI_LOCAL_BACKEND'] = 'ollama';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    const nonInteractiveConfig = createLocalMockConfig({
      getOutputFormat: vi.fn().mockReturnValue(OutputFormat.TEXT),
    });

    try {
      await validateNonInteractiveAuth(
        undefined,
        undefined,
        nonInteractiveConfig,
        mockSettings,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain(
        `process.exit(${ExitCodes.FATAL_AUTHENTICATION_ERROR}) called`,
      );
    }

    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ollama is not running at'),
    );
    expect(processExitSpy).toHaveBeenCalledWith(
      ExitCodes.FATAL_AUTHENTICATION_ERROR,
    );
    fetchSpy.mockRestore();
  });

  it('detects OLLAMA_HOST env var as USE_LOCAL_OLLAMA', async () => {
    process.env['OLLAMA_HOST'] = 'http://localhost:11434';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const nonInteractiveConfig = createLocalMockConfig({});

    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );

    expect(processExitSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('uses USE_VERTEX_AI if GOOGLE_GENAI_USE_VERTEXAI is true (with GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION)', async () => {
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
    process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('uses USE_VERTEX_AI if GOOGLE_GENAI_USE_VERTEXAI is true and GOOGLE_API_KEY is set', async () => {
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    process.env['GOOGLE_API_KEY'] = 'vertex-api-key';
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('uses LOGIN_WITH_GOOGLE if GOOGLE_GENAI_USE_GCA is set, even with other env vars', async () => {
    process.env['GOOGLE_GENAI_USE_GCA'] = 'true';
    process.env['GEMINI_API_KEY'] = 'fake-key';
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
    process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('uses USE_VERTEX_AI if both GEMINI_API_KEY and GOOGLE_GENAI_USE_VERTEXAI are set', async () => {
    process.env['GEMINI_API_KEY'] = 'fake-key';
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
    process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('uses USE_GEMINI if GOOGLE_GENAI_USE_VERTEXAI is false, GEMINI_API_KEY is set, and project/location are available', async () => {
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'false';
    process.env['GEMINI_API_KEY'] = 'fake-key';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
    process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('uses configuredAuthType over environment variables', async () => {
    process.env['GEMINI_API_KEY'] = 'fake-key';
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('exits if validateAuthMethod returns error', async () => {
    // Mock validateAuthMethod to return error
    vi.spyOn(auth, 'validateAuthMethod').mockResolvedValue('Auth error!');
    const nonInteractiveConfig = createLocalMockConfig({
      getOutputFormat: vi.fn().mockReturnValue(OutputFormat.TEXT),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue({ authType: undefined }),
    });
    try {
      await validateNonInteractiveAuth(
        AuthType.USE_GEMINI,
        undefined,
        nonInteractiveConfig,
        mockSettings,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain(
        `process.exit(${ExitCodes.FATAL_AUTHENTICATION_ERROR}) called`,
      );
    }
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith('Auth error!');
    expect(processExitSpy).toHaveBeenCalledWith(
      ExitCodes.FATAL_AUTHENTICATION_ERROR,
    );
  });

  it('skips validation if useExternalAuth is true', async () => {
    // Mock validateAuthMethod to return error to ensure it's not being called
    const validateAuthMethodSpy = vi
      .spyOn(auth, 'validateAuthMethod')
      .mockResolvedValue('Auth error!');
    const nonInteractiveConfig = createLocalMockConfig({});
    // Even with an invalid auth type, it should not exit
    // because validation is skipped.
    await validateNonInteractiveAuth(
      'invalid-auth-type' as AuthType,
      true, // useExternalAuth = true
      nonInteractiveConfig,
      mockSettings,
    );

    expect(validateAuthMethodSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
    expect(coreEventsEmitFeedbackSpy).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('succeeds if effectiveAuthType matches enforcedType', async () => {
    mockSettings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
    process.env['GEMINI_API_KEY'] = 'fake-key';
    const nonInteractiveConfig = createLocalMockConfig({});
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(processExitSpy).not.toHaveBeenCalled();
    expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
  });

  it('exits if configuredAuthType does not match enforcedType', async () => {
    mockSettings.merged.security.auth.enforcedType = AuthType.LOGIN_WITH_GOOGLE;
    const nonInteractiveConfig = createLocalMockConfig({
      getOutputFormat: vi.fn().mockReturnValue(OutputFormat.TEXT),
    });
    try {
      await validateNonInteractiveAuth(
        AuthType.USE_GEMINI,
        undefined,
        nonInteractiveConfig,
        mockSettings,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain(
        `process.exit(${ExitCodes.FATAL_AUTHENTICATION_ERROR}) called`,
      );
    }
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      "The enforced authentication type is 'oauth-personal', but the current type is 'gemini-api-key'. Please re-authenticate with the correct type.",
    );
    expect(processExitSpy).toHaveBeenCalledWith(
      ExitCodes.FATAL_AUTHENTICATION_ERROR,
    );
  });

  it('exits if auth from env var does not match enforcedType', async () => {
    mockSettings.merged.security.auth.enforcedType = AuthType.LOGIN_WITH_GOOGLE;
    process.env['GEMINI_API_KEY'] = 'fake-key';
    const nonInteractiveConfig = createLocalMockConfig({
      getOutputFormat: vi.fn().mockReturnValue(OutputFormat.TEXT),
    });
    try {
      await validateNonInteractiveAuth(
        undefined,
        undefined,
        nonInteractiveConfig,
        mockSettings,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain(
        `process.exit(${ExitCodes.FATAL_AUTHENTICATION_ERROR}) called`,
      );
    }
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      "The enforced authentication type is 'oauth-personal', but the current type is 'gemini-api-key'. Please re-authenticate with the correct type.",
    );
    expect(processExitSpy).toHaveBeenCalledWith(
      ExitCodes.FATAL_AUTHENTICATION_ERROR,
    );
  });

  describe('JSON output mode', () => {
    it(`prints JSON error when no auth is configured and exits with code ${ExitCodes.FATAL_AUTHENTICATION_ERROR}`, async () => {
      const nonInteractiveConfig = createLocalMockConfig({
        getOutputFormat: vi.fn().mockReturnValue(OutputFormat.JSON),
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue({ authType: undefined }),
      });

      let thrown: Error | undefined;
      try {
        await validateNonInteractiveAuth(
          undefined,
          undefined,
          nonInteractiveConfig,
          mockSettings,
        );
      } catch (e) {
        thrown = e as Error;
      }

      expect(thrown?.message).toBe(
        `process.exit(${ExitCodes.FATAL_AUTHENTICATION_ERROR}) called`,
      );
      // Checking coreEventsEmitFeedbackSpy arguments
      const errorArg = coreEventsEmitFeedbackSpy.mock.calls[0]?.[1] as string;
      const payload = JSON.parse(errorArg);
      expect(payload.error.type).toBe('Error');
      expect(payload.error.code).toBe(ExitCodes.FATAL_AUTHENTICATION_ERROR);
      expect(payload.error.message).toContain(
        'Please set an Auth method in your',
      );
    });

    it(`prints JSON error when enforced auth mismatches current auth and exits with code ${ExitCodes.FATAL_AUTHENTICATION_ERROR}`, async () => {
      mockSettings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
      const nonInteractiveConfig = createLocalMockConfig({
        getOutputFormat: vi.fn().mockReturnValue(OutputFormat.JSON),
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue({ authType: undefined }),
      });

      let thrown: Error | undefined;
      try {
        await validateNonInteractiveAuth(
          AuthType.LOGIN_WITH_GOOGLE,
          undefined,
          nonInteractiveConfig,
          mockSettings,
        );
      } catch (e) {
        thrown = e as Error;
      }

      expect(thrown?.message).toBe(
        `process.exit(${ExitCodes.FATAL_AUTHENTICATION_ERROR}) called`,
      );
      {
        // Checking coreEventsEmitFeedbackSpy arguments
        const errorArg = coreEventsEmitFeedbackSpy.mock.calls[0]?.[1] as string;
        const payload = JSON.parse(errorArg);
        expect(payload.error.type).toBe('Error');
        expect(payload.error.code).toBe(ExitCodes.FATAL_AUTHENTICATION_ERROR);
        expect(payload.error.message).toContain(
          "The enforced authentication type is 'gemini-api-key', but the current type is 'oauth-personal'. Please re-authenticate with the correct type.",
        );
      }
    });

    it(`prints JSON error when validateAuthMethod fails and exits with code ${ExitCodes.FATAL_AUTHENTICATION_ERROR}`, async () => {
      vi.spyOn(auth, 'validateAuthMethod').mockResolvedValue('Auth error!');
      process.env['GEMINI_API_KEY'] = 'fake-key';

      const nonInteractiveConfig = createLocalMockConfig({
        getOutputFormat: vi.fn().mockReturnValue(OutputFormat.JSON),
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue({ authType: undefined }),
      });

      let thrown: Error | undefined;
      try {
        await validateNonInteractiveAuth(
          AuthType.USE_GEMINI,
          undefined,
          nonInteractiveConfig,
          mockSettings,
        );
      } catch (e) {
        thrown = e as Error;
      }

      expect(thrown?.message).toBe(
        `process.exit(${ExitCodes.FATAL_AUTHENTICATION_ERROR}) called`,
      );
      {
        // Checking coreEventsEmitFeedbackSpy arguments
        const errorArg = coreEventsEmitFeedbackSpy.mock.calls[0]?.[1] as string;
        const payload = JSON.parse(errorArg);
        expect(payload.error.type).toBe('Error');
        expect(payload.error.code).toBe(ExitCodes.FATAL_AUTHENTICATION_ERROR);
        expect(payload.error.message).toBe('Auth error!');
      }
    });
  });
});
