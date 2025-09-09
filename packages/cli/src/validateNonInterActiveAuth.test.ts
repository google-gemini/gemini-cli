/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import { AuthType } from '@google/gemini-cli-core';
import * as auth from './config/auth.js';
import { type LoadedSettings } from './config/settings.js';

describe('validateNonInterActiveAuth', () => {
  let originalEnvGeminiApiKey: string | undefined;
  let originalEnvVertexAi: string | undefined;
  let originalEnvGcp: string | undefined;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let refreshAuthMock: vi.Mock;
  let mockSettings: LoadedSettings;

  beforeEach(() => {
    originalEnvGeminiApiKey = process.env['GEMINI_API_KEY'];
    originalEnvVertexAi = process.env['GOOGLE_GENAI_USE_VERTEXAI'];
    originalEnvGcp = process.env['GOOGLE_GENAI_USE_GCA'];
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GOOGLE_GENAI_USE_VERTEXAI'];
    delete process.env['GOOGLE_GENAI_USE_GCA'];
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code}) called`);
    });
    refreshAuthMock = vi.fn().mockResolvedValue('refreshed');
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
      migratedInMemorScopes: new Set(),
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
    vi.restoreAllMocks();
  });

  it('exits if no auth type is configured or env vars set', async () => {
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    try {
      await validateNonInteractiveAuth(
        undefined,
        undefined,
        nonInteractiveConfig,
        mockSettings,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain('process.exit(1) called');
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Please set an Auth method'),
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('uses LOGIN_WITH_GOOGLE if GOOGLE_GENAI_USE_GCA is set', async () => {
    process.env['GOOGLE_GENAI_USE_GCA'] = 'true';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.LOGIN_WITH_GOOGLE);
  });

  it('uses USE_GEMINI if GEMINI_API_KEY is set', async () => {
    process.env['GEMINI_API_KEY'] = 'fake-key';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_GEMINI);
  });

  it('uses USE_VERTEX_AI if GOOGLE_GENAI_USE_VERTEXAI is true (with GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION)', async () => {
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
    process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_VERTEX_AI);
  });

  it('uses USE_VERTEX_AI if GOOGLE_GENAI_USE_VERTEXAI is true and GOOGLE_API_KEY is set', async () => {
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    process.env['GOOGLE_API_KEY'] = 'vertex-api-key';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_VERTEX_AI);
  });

  it('uses LOGIN_WITH_GOOGLE if GOOGLE_GENAI_USE_GCA is set, even with other env vars', async () => {
    process.env['GOOGLE_GENAI_USE_GCA'] = 'true';
    process.env['GEMINI_API_KEY'] = 'fake-key';
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
    process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.LOGIN_WITH_GOOGLE);
  });

  it('uses USE_VERTEX_AI if both GEMINI_API_KEY and GOOGLE_GENAI_USE_VERTEXAI are set', async () => {
    process.env['GEMINI_API_KEY'] = 'fake-key';
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
    process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_VERTEX_AI);
  });

  it('uses USE_GEMINI if GOOGLE_GENAI_USE_VERTEXAI is false, GEMINI_API_KEY is set, and project/location are available', async () => {
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'false';
    process.env['GEMINI_API_KEY'] = 'fake-key';
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-project';
    process.env['GOOGLE_CLOUD_LOCATION'] = 'us-central1';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_GEMINI);
  });

  it('uses configuredAuthType if provided', async () => {
    // Set required env var for USE_GEMINI
    process.env['GEMINI_API_KEY'] = 'fake-key';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      AuthType.USE_GEMINI,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_GEMINI);
  });

  it('exits if validateAuthMethod returns error', async () => {
    // Mock validateAuthMethod to return error
    vi.spyOn(auth, 'validateAuthMethod').mockReturnValue('Auth error!');
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    try {
      await validateNonInteractiveAuth(
        AuthType.USE_GEMINI,
        undefined,
        nonInteractiveConfig,
        mockSettings,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain('process.exit(1) called');
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error!');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('skips validation if useExternalAuth is true', async () => {
    // Mock validateAuthMethod to return error to ensure it's not being called
    const validateAuthMethodSpy = vi
      .spyOn(auth, 'validateAuthMethod')
      .mockReturnValue('Auth error!');
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };

    // Even with an invalid auth type, it should not exit
    // because validation is skipped.
    await validateNonInteractiveAuth(
      'invalid-auth-type' as AuthType,
      true, // useExternalAuth = true
      nonInteractiveConfig,
      mockSettings,
    );

    expect(validateAuthMethodSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
    // We still expect refreshAuth to be called with the (invalid) type
    expect(refreshAuthMock).toHaveBeenCalledWith('invalid-auth-type');
  });

  it('uses enforcedAuthType if provided', async () => {
    mockSettings.merged.security.auth.enforcedType = AuthType.USE_GEMINI;
    mockSettings.merged.security.auth.selectedType = AuthType.USE_GEMINI;
    // Set required env var for USE_GEMINI to ensure enforcedAuthType takes precedence
    process.env['GEMINI_API_KEY'] = 'fake-key';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      AuthType.USE_GEMINI,
      undefined,
      nonInteractiveConfig,
      mockSettings,
    );
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_GEMINI);
  });

  it('exits if currentAuthType does not match enforcedAuthType', async () => {
    mockSettings.merged.security.auth.enforcedType = AuthType.LOGIN_WITH_GOOGLE;
    process.env['GOOGLE_GENAI_USE_VERTEXAI'] = 'true';
    const nonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    try {
      await validateNonInteractiveAuth(
        AuthType.USE_GEMINI,
        undefined,
        nonInteractiveConfig,
        mockSettings,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain('process.exit(1) called');
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'The configured auth type is oauth-personal, but the current auth type is vertex-ai. Please re-authenticate with the correct type.',
    );
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
