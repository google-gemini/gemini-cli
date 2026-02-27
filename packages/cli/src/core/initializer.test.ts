/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeApp } from './initializer.js';
import {
  IdeClient,
  logIdeConnection,
  logCliConfiguration,
  AuthType,
  type Config,
} from '@google/gemini-cli-core';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';
import { type LoadedSettings } from '../config/settings.js';
import { loadAuthState } from '../config/authState.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    IdeClient: {
      getInstance: vi.fn(),
    },
    logIdeConnection: vi.fn(),
    logCliConfiguration: vi.fn(),
    StartSessionEvent: vi.fn(),
    IdeConnectionEvent: vi.fn(),
  };
});

vi.mock('./auth.js', () => ({
  performInitialAuth: vi.fn(),
}));

vi.mock('./theme.js', () => ({
  validateTheme: vi.fn(),
}));

vi.mock('../config/authState.js', () => ({
  loadAuthState: vi.fn(),
  parseAuthType: vi.fn((value: unknown) => {
    switch (value) {
      case AuthType.LOGIN_WITH_GOOGLE:
      case AuthType.USE_GEMINI:
      case AuthType.USE_VERTEX_AI:
      case AuthType.LEGACY_CLOUD_SHELL:
      case AuthType.COMPUTE_ADC:
        return value;
      default:
        return undefined;
    }
  }),
}));

describe('initializer', () => {
  let mockConfig: {
    getToolRegistry: ReturnType<typeof vi.fn>;
    getIdeMode: ReturnType<typeof vi.fn>;
    getGeminiMdFileCount: ReturnType<typeof vi.fn>;
  };
  let mockSettings: LoadedSettings;
  let mockIdeClient: {
    connect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getToolRegistry: vi.fn(),
      getIdeMode: vi.fn().mockReturnValue(false),
      getGeminiMdFileCount: vi.fn().mockReturnValue(5),
    };
    mockSettings = {
      merged: {
        security: {
          auth: {
            selectedType: AuthType.LOGIN_WITH_GOOGLE,
          },
        },
      },
    } as unknown as LoadedSettings;
    mockIdeClient = {
      connect: vi.fn(),
    };
    vi.mocked(IdeClient.getInstance).mockResolvedValue(
      mockIdeClient as unknown as IdeClient,
    );
    vi.mocked(performInitialAuth).mockResolvedValue(null);
    vi.mocked(validateTheme).mockReturnValue(null);
    vi.mocked(loadAuthState).mockReturnValue({
      selectedType: AuthType.LOGIN_WITH_GOOGLE,
    });
  });

  it('should initialize correctly in non-IDE mode', async () => {
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result).toEqual({
      authError: null,
      themeError: null,
      shouldOpenAuthDialog: false,
      geminiMdFileCount: 5,
    });
    expect(performInitialAuth).toHaveBeenCalledWith(
      mockConfig,
      AuthType.LOGIN_WITH_GOOGLE,
    );
    expect(validateTheme).toHaveBeenCalledWith(mockSettings);
    expect(logCliConfiguration).toHaveBeenCalled();
    expect(IdeClient.getInstance).not.toHaveBeenCalled();
  });

  it('should initialize correctly in IDE mode', async () => {
    mockConfig.getIdeMode.mockReturnValue(true);
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result).toEqual({
      authError: null,
      themeError: null,
      shouldOpenAuthDialog: false,
      geminiMdFileCount: 5,
    });
    expect(IdeClient.getInstance).toHaveBeenCalled();
    expect(mockIdeClient.connect).toHaveBeenCalled();
    expect(logIdeConnection).toHaveBeenCalledWith(
      mockConfig as unknown as Config,
      expect.any(Object),
    );
  });

  it('should handle auth error', async () => {
    vi.mocked(performInitialAuth).mockResolvedValue('Auth failed');
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result.authError).toBe('Auth failed');
    expect(result.shouldOpenAuthDialog).toBe(true);
  });

  it('should handle undefined auth type', async () => {
    vi.mocked(loadAuthState).mockReturnValue({});
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result.shouldOpenAuthDialog).toBe(true);
  });

  it('should handle theme error', async () => {
    vi.mocked(validateTheme).mockReturnValue('Theme not found');
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result.themeError).toBe('Theme not found');
  });
});
