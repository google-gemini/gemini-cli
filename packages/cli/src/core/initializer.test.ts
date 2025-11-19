/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { initializeApp, type InitializationResult } from './initializer.js';
import type { Config } from '@google/gemini-cli-core';
import { IdeClient, AuthType } from '@google/gemini-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import * as authModule from './auth.js';
import * as themeModule from './theme.js';

vi.mock('./auth.js');
vi.mock('./theme.js');
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    IdeClient: {
      getInstance: vi.fn(),
    },
    logIdeConnection: vi.fn(),
    IdeConnectionEvent: vi.fn((type) => ({ type })),
    IdeConnectionType: {
      START: 'START',
    },
  };
});

describe('initializer', () => {
  let mockConfig: Config;
  let mockSettings: LoadedSettings;
  let mockIdeClient: { connect: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockConfig = {
      getIdeMode: vi.fn().mockReturnValue(false),
      getGeminiMdFileCount: vi.fn().mockReturnValue(0),
    } as unknown as Config;

    mockSettings = {
      merged: {
        security: {
          auth: {
            selectedType: AuthType.GeminiAPIKey,
          },
        },
      },
    } as LoadedSettings;

    mockIdeClient = {
      connect: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(IdeClient.getInstance).mockResolvedValue(mockIdeClient as never);
    vi.mocked(authModule.performInitialAuth).mockResolvedValue(null);
    vi.mocked(themeModule.validateTheme).mockReturnValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('InitializationResult type', () => {
    it('should define valid InitializationResult', () => {
      const result: InitializationResult = {
        authError: null,
        themeError: null,
        shouldOpenAuthDialog: false,
        geminiMdFileCount: 0,
      };

      expect(result).toBeDefined();
    });

    it('should allow errors', () => {
      const result: InitializationResult = {
        authError: 'Auth failed',
        themeError: 'Invalid theme',
        shouldOpenAuthDialog: true,
        geminiMdFileCount: 5,
      };

      expect(result.authError).toBe('Auth failed');
      expect(result.themeError).toBe('Invalid theme');
    });
  });

  describe('initializeApp', () => {
    describe('successful initialization', () => {
      it('should initialize app successfully', async () => {
        const result = await initializeApp(mockConfig, mockSettings);

        expect(result).toBeDefined();
        expect(result.authError).toBeNull();
        expect(result.themeError).toBeNull();
        expect(result.shouldOpenAuthDialog).toBe(false);
      });

      it('should call performInitialAuth', async () => {
        await initializeApp(mockConfig, mockSettings);

        expect(authModule.performInitialAuth).toHaveBeenCalledWith(
          mockConfig,
          AuthType.GeminiAPIKey,
        );
      });

      it('should call validateTheme', async () => {
        await initializeApp(mockConfig, mockSettings);

        expect(themeModule.validateTheme).toHaveBeenCalledWith(mockSettings);
      });

      it('should return geminiMdFileCount from config', async () => {
        vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(3);

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.geminiMdFileCount).toBe(3);
      });
    });

    describe('authentication handling', () => {
      it('should pass selectedType to performInitialAuth', async () => {
        mockSettings.merged.security!.auth!.selectedType =
          AuthType.ApplicationDefaultCredentials;

        await initializeApp(mockConfig, mockSettings);

        expect(authModule.performInitialAuth).toHaveBeenCalledWith(
          mockConfig,
          AuthType.ApplicationDefaultCredentials,
        );
      });

      it('should handle auth error', async () => {
        vi.mocked(authModule.performInitialAuth).mockResolvedValue(
          'Authentication failed',
        );

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.authError).toBe('Authentication failed');
      });

      it('should set shouldOpenAuthDialog when auth fails', async () => {
        vi.mocked(authModule.performInitialAuth).mockResolvedValue(
          'Auth error',
        );

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.shouldOpenAuthDialog).toBe(true);
      });

      it('should set shouldOpenAuthDialog when selectedType undefined', async () => {
        mockSettings.merged.security!.auth!.selectedType = undefined;

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.shouldOpenAuthDialog).toBe(true);
      });

      it('should not open dialog when auth succeeds and type selected', async () => {
        vi.mocked(authModule.performInitialAuth).mockResolvedValue(null);
        mockSettings.merged.security!.auth!.selectedType =
          AuthType.GeminiAPIKey;

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.shouldOpenAuthDialog).toBe(false);
      });

      it('should handle undefined selectedType', async () => {
        mockSettings.merged.security!.auth!.selectedType = undefined;

        await initializeApp(mockConfig, mockSettings);

        expect(authModule.performInitialAuth).toHaveBeenCalledWith(
          mockConfig,
          undefined,
        );
      });
    });

    describe('theme validation', () => {
      it('should return theme error when validation fails', async () => {
        vi.mocked(themeModule.validateTheme).mockReturnValue(
          'Invalid theme configuration',
        );

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.themeError).toBe('Invalid theme configuration');
      });

      it('should return null theme error when validation succeeds', async () => {
        vi.mocked(themeModule.validateTheme).mockReturnValue(null);

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.themeError).toBeNull();
      });
    });

    describe('IDE mode', () => {
      beforeEach(() => {
        vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
      });

      it('should connect to IDE when IDE mode enabled', async () => {
        await initializeApp(mockConfig, mockSettings);

        expect(IdeClient.getInstance).toHaveBeenCalled();
        expect(mockIdeClient.connect).toHaveBeenCalled();
      });

      it('should not connect to IDE when IDE mode disabled', async () => {
        vi.mocked(mockConfig.getIdeMode).mockReturnValue(false);

        await initializeApp(mockConfig, mockSettings);

        expect(IdeClient.getInstance).not.toHaveBeenCalled();
      });

      it('should get IDE client instance before connecting', async () => {
        await initializeApp(mockConfig, mockSettings);

        expect(IdeClient.getInstance).toHaveBeenCalledBefore(
          mockIdeClient.connect,
        );
      });

      it('should handle IDE connection errors', async () => {
        vi.mocked(mockIdeClient.connect).mockRejectedValue(
          new Error('Connection failed'),
        );

        await expect(initializeApp(mockConfig, mockSettings)).rejects.toThrow(
          'Connection failed',
        );
      });

      it('should initialize app even without IDE mode', async () => {
        vi.mocked(mockConfig.getIdeMode).mockReturnValue(false);

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result).toBeDefined();
        expect(result.authError).toBeNull();
      });
    });

    describe('file count', () => {
      it('should return 0 when no files loaded', async () => {
        vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(0);

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.geminiMdFileCount).toBe(0);
      });

      it('should return correct file count', async () => {
        vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(5);

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.geminiMdFileCount).toBe(5);
      });

      it('should call getGeminiMdFileCount', async () => {
        await initializeApp(mockConfig, mockSettings);

        expect(mockConfig.getGeminiMdFileCount).toHaveBeenCalled();
      });
    });

    describe('error combinations', () => {
      it('should handle both auth and theme errors', async () => {
        vi.mocked(authModule.performInitialAuth).mockResolvedValue(
          'Auth error',
        );
        vi.mocked(themeModule.validateTheme).mockReturnValue('Theme error');

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.authError).toBe('Auth error');
        expect(result.themeError).toBe('Theme error');
        expect(result.shouldOpenAuthDialog).toBe(true);
      });

      it('should handle auth error only', async () => {
        vi.mocked(authModule.performInitialAuth).mockResolvedValue(
          'Auth error',
        );
        vi.mocked(themeModule.validateTheme).mockReturnValue(null);

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.authError).toBe('Auth error');
        expect(result.themeError).toBeNull();
      });

      it('should handle theme error only', async () => {
        vi.mocked(authModule.performInitialAuth).mockResolvedValue(null);
        vi.mocked(themeModule.validateTheme).mockReturnValue('Theme error');

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result.authError).toBeNull();
        expect(result.themeError).toBe('Theme error');
        expect(result.shouldOpenAuthDialog).toBe(false);
      });
    });

    describe('execution order', () => {
      it('should call auth before theme validation', async () => {
        await initializeApp(mockConfig, mockSettings);

        expect(authModule.performInitialAuth).toHaveBeenCalledBefore(
          themeModule.validateTheme as never,
        );
      });

      it('should check IDE mode after auth and theme', async () => {
        vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);

        await initializeApp(mockConfig, mockSettings);

        expect(authModule.performInitialAuth).toHaveBeenCalledBefore(
          mockConfig.getIdeMode as never,
        );
        expect(themeModule.validateTheme).toHaveBeenCalledBefore(
          mockConfig.getIdeMode as never,
        );
      });
    });

    describe('return value structure', () => {
      it('should return object with all required fields', async () => {
        const result = await initializeApp(mockConfig, mockSettings);

        expect(result).toHaveProperty('authError');
        expect(result).toHaveProperty('themeError');
        expect(result).toHaveProperty('shouldOpenAuthDialog');
        expect(result).toHaveProperty('geminiMdFileCount');
      });

      it('should return boolean for shouldOpenAuthDialog', async () => {
        const result = await initializeApp(mockConfig, mockSettings);

        expect(typeof result.shouldOpenAuthDialog).toBe('boolean');
      });

      it('should return number for geminiMdFileCount', async () => {
        const result = await initializeApp(mockConfig, mockSettings);

        expect(typeof result.geminiMdFileCount).toBe('number');
      });
    });

    describe('integration scenarios', () => {
      it('should handle full successful initialization', async () => {
        vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
        vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(2);
        vi.mocked(authModule.performInitialAuth).mockResolvedValue(null);
        vi.mocked(themeModule.validateTheme).mockReturnValue(null);

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result).toEqual({
          authError: null,
          themeError: null,
          shouldOpenAuthDialog: false,
          geminiMdFileCount: 2,
        });
      });

      it('should handle initialization with errors', async () => {
        vi.mocked(authModule.performInitialAuth).mockResolvedValue(
          'Failed to authenticate',
        );
        vi.mocked(themeModule.validateTheme).mockReturnValue('Invalid theme');
        vi.mocked(mockConfig.getGeminiMdFileCount).mockReturnValue(0);

        const result = await initializeApp(mockConfig, mockSettings);

        expect(result).toEqual({
          authError: 'Failed to authenticate',
          themeError: 'Invalid theme',
          shouldOpenAuthDialog: true,
          geminiMdFileCount: 0,
        });
      });

      it('should handle IDE mode with auth error', async () => {
        vi.mocked(mockConfig.getIdeMode).mockReturnValue(true);
        vi.mocked(authModule.performInitialAuth).mockResolvedValue(
          'Auth failed',
        );

        const result = await initializeApp(mockConfig, mockSettings);

        expect(mockIdeClient.connect).toHaveBeenCalled();
        expect(result.authError).toBe('Auth failed');
        expect(result.shouldOpenAuthDialog).toBe(true);
      });
    });
  });
});
