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
  type Mock,
} from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useAuthCommand, validateAuthMethodWithSettings } from './useAuth.js';
import { AuthType, type Config } from '@google/gemini-cli-core';
import { AuthState } from '../types.js';
import type { LoadedSettings } from '../../config/settings.js';
import { waitFor } from '../../test-utils/async.js';

// Mock dependencies
const mockLoadApiKey = vi.fn();
const mockValidateAuthMethod = vi.fn();

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    loadApiKey: () => mockLoadApiKey(),
  };
});

vi.mock('../../config/auth.js', () => ({
  validateAuthMethod: (authType: AuthType) => mockValidateAuthMethod(authType),
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_DEFAULT_AUTH_TYPE'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateAuthMethodWithSettings', () => {
    it('should return error if auth type is enforced and does not match', () => {
      const settings = {
        merged: {
          security: {
            auth: {
              enforcedType: AuthType.LOGIN_WITH_GOOGLE,
            },
          },
        },
      } as LoadedSettings;

      const error = validateAuthMethodWithSettings(
        AuthType.USE_GEMINI,
        settings,
      );
      expect(error).toContain('Authentication is enforced to be oauth');
    });

    it('should return null if useExternal is true', () => {
      const settings = {
        merged: {
          security: {
            auth: {
              useExternal: true,
            },
          },
        },
      } as LoadedSettings;

      const error = validateAuthMethodWithSettings(
        AuthType.LOGIN_WITH_GOOGLE,
        settings,
      );
      expect(error).toBeNull();
    });

    it('should return null if authType is USE_GEMINI', () => {
      const settings = {
        merged: {
          security: {
            auth: {},
          },
        },
      } as LoadedSettings;

      const error = validateAuthMethodWithSettings(
        AuthType.USE_GEMINI,
        settings,
      );
      expect(error).toBeNull();
    });

    it('should call validateAuthMethod for other auth types', () => {
      const settings = {
        merged: {
          security: {
            auth: {},
          },
        },
      } as LoadedSettings;

      mockValidateAuthMethod.mockReturnValue('Validation Error');
      const error = validateAuthMethodWithSettings(
        AuthType.LOGIN_WITH_GOOGLE,
        settings,
      );
      expect(error).toBe('Validation Error');
      expect(mockValidateAuthMethod).toHaveBeenCalledWith(
        AuthType.LOGIN_WITH_GOOGLE,
      );
    });
  });

  describe('useAuthCommand', () => {
    const mockConfig = {
      refreshAuth: vi.fn(),
    } as unknown as Config;

    const createSettings = (selectedType?: AuthType) =>
      ({
        merged: {
          security: {
            auth: {
              selectedType,
            },
          },
        },
      }) as LoadedSettings;

    it('should initialize with Unauthenticated state', () => {
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );
      expect(result.current.authState).toBe(AuthState.Unauthenticated);
    });

    it('should set error if no auth type is selected and no env key', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toBe(
          'No authentication method selected.',
        );
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });

    it('should set error if no auth type is selected but env key exists', async () => {
      process.env['GEMINI_API_KEY'] = 'env-key';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain(
          'Existing API key detected (GEMINI_API_KEY)',
        );
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });

    it('should transition to AwaitingApiKeyInput if USE_GEMINI and no key found', async () => {
      mockLoadApiKey.mockResolvedValue(null);
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.AwaitingApiKeyInput);
      });
    });

    it('should authenticate if USE_GEMINI and key is found', async () => {
      mockLoadApiKey.mockResolvedValue('stored-key');
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(result.current.apiKeyDefaultValue).toBe('stored-key');
      });
    });

    it('should authenticate if USE_GEMINI and env key is found', async () => {
      mockLoadApiKey.mockResolvedValue(null);
      process.env['GEMINI_API_KEY'] = 'env-key';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(result.current.apiKeyDefaultValue).toBe('env-key');
      });
    });

    it('should prioritize env key over stored key when both are present', async () => {
      mockLoadApiKey.mockResolvedValue('stored-key');
      process.env['GEMINI_API_KEY'] = 'env-key';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        // The environment key should take precedence
        expect(result.current.apiKeyDefaultValue).toBe('env-key');
      });
    });

    it('should set error if validation fails', async () => {
      mockValidateAuthMethod.mockReturnValue('Validation Failed');
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toBe('Validation Failed');
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });

    it('should set error if GEMINI_DEFAULT_AUTH_TYPE is invalid', async () => {
      process.env['GEMINI_DEFAULT_AUTH_TYPE'] = 'INVALID_TYPE';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain(
          'Invalid value for GEMINI_DEFAULT_AUTH_TYPE',
        );
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });

    it('should authenticate successfully for valid auth type', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.LOGIN_WITH_GOOGLE,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(result.current.authError).toBeNull();
      });
    });

    it('should handle refreshAuth failure', async () => {
      (mockConfig.refreshAuth as Mock).mockRejectedValue(
        new Error('Auth Failed'),
      );
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain('Failed to login');
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });
  });
});
