/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { validateAuthMethodWithSettings, useAuthCommand } from './useAuth.js';
import type { LoadedSettings } from '../../config/settings.js';
import { AuthType, type Config } from '@google/gemini-cli-core';
import { AuthState } from '../types.js';
import * as authModule from '../../config/auth.js';

vi.mock('../../config/auth.js');

describe('validateAuthMethodWithSettings', () => {
  let mockSettings: LoadedSettings;

  beforeEach(() => {
    mockSettings = {
      merged: {
        security: {
          auth: {
            selectedType: AuthType.GeminiAPIKey,
          },
        },
      },
    } as LoadedSettings;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('enforced auth type', () => {
    it('should return null when auth type matches enforced type', () => {
      mockSettings.merged.security!.auth!.enforcedType = AuthType.GeminiAPIKey;

      const result = validateAuthMethodWithSettings(
        AuthType.GeminiAPIKey,
        mockSettings,
      );

      expect(result).toBeNull();
    });

    it('should return error when auth type does not match enforced type', () => {
      mockSettings.merged.security!.auth!.enforcedType = AuthType.GeminiAPIKey;

      const result = validateAuthMethodWithSettings(
        AuthType.ApplicationDefaultCredentials,
        mockSettings,
      );

      expect(result).toContain('Authentication is enforced to be');
      expect(result).toContain(AuthType.GeminiAPIKey);
      expect(result).toContain(AuthType.ApplicationDefaultCredentials);
    });

    it('should include both auth types in error message', () => {
      mockSettings.merged.security!.auth!.enforcedType =
        AuthType.ApplicationDefaultCredentials;

      const result = validateAuthMethodWithSettings(
        AuthType.GeminiAPIKey,
        mockSettings,
      );

      expect(result).toMatch(/enforced to be.*but you are currently using/);
    });
  });

  describe('external auth', () => {
    it('should return null when useExternal is true', () => {
      mockSettings.merged.security!.auth!.useExternal = true;
      vi.mocked(authModule.validateAuthMethod).mockReturnValue('should ignore');

      const result = validateAuthMethodWithSettings(
        AuthType.GeminiAPIKey,
        mockSettings,
      );

      expect(result).toBeNull();
    });

    it('should not call validateAuthMethod when useExternal is true', () => {
      mockSettings.merged.security!.auth!.useExternal = true;
      const spy = vi
        .mocked(authModule.validateAuthMethod)
        .mockReturnValue(null);

      validateAuthMethodWithSettings(AuthType.GeminiAPIKey, mockSettings);

      expect(spy).not.toHaveBeenCalled();
    });

    it('should call validateAuthMethod when useExternal is false', () => {
      mockSettings.merged.security!.auth!.useExternal = false;
      const spy = vi
        .mocked(authModule.validateAuthMethod)
        .mockReturnValue(null);

      validateAuthMethodWithSettings(AuthType.GeminiAPIKey, mockSettings);

      expect(spy).toHaveBeenCalledWith(AuthType.GeminiAPIKey);
    });

    it('should call validateAuthMethod when useExternal is undefined', () => {
      delete mockSettings.merged.security!.auth!.useExternal;
      const spy = vi
        .mocked(authModule.validateAuthMethod)
        .mockReturnValue(null);

      validateAuthMethodWithSettings(AuthType.GeminiAPIKey, mockSettings);

      expect(spy).toHaveBeenCalledWith(AuthType.GeminiAPIKey);
    });
  });

  describe('validateAuthMethod delegation', () => {
    it('should return error from validateAuthMethod', () => {
      vi.mocked(authModule.validateAuthMethod).mockReturnValue(
        'Auth validation error',
      );

      const result = validateAuthMethodWithSettings(
        AuthType.GeminiAPIKey,
        mockSettings,
      );

      expect(result).toBe('Auth validation error');
    });

    it('should return null from validateAuthMethod', () => {
      vi.mocked(authModule.validateAuthMethod).mockReturnValue(null);

      const result = validateAuthMethodWithSettings(
        AuthType.GeminiAPIKey,
        mockSettings,
      );

      expect(result).toBeNull();
    });

    it('should pass auth type to validateAuthMethod', () => {
      const spy = vi
        .mocked(authModule.validateAuthMethod)
        .mockReturnValue(null);

      validateAuthMethodWithSettings(
        AuthType.ApplicationDefaultCredentials,
        mockSettings,
      );

      expect(spy).toHaveBeenCalledWith(AuthType.ApplicationDefaultCredentials);
    });
  });

  describe('priority of validations', () => {
    it('should check enforced type before useExternal', () => {
      mockSettings.merged.security!.auth!.enforcedType = AuthType.GeminiAPIKey;
      mockSettings.merged.security!.auth!.useExternal = true;

      const result = validateAuthMethodWithSettings(
        AuthType.ApplicationDefaultCredentials,
        mockSettings,
      );

      expect(result).toContain('Authentication is enforced');
    });

    it('should check useExternal before validateAuthMethod', () => {
      mockSettings.merged.security!.auth!.useExternal = true;
      vi.mocked(authModule.validateAuthMethod).mockReturnValue(
        'should not reach here',
      );

      const result = validateAuthMethodWithSettings(
        AuthType.GeminiAPIKey,
        mockSettings,
      );

      expect(result).toBeNull();
      expect(authModule.validateAuthMethod).not.toHaveBeenCalled();
    });
  });
});

describe('useAuthCommand', () => {
  let mockSettings: LoadedSettings;
  let mockConfig: Config;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockSettings = {
      merged: {
        security: {
          auth: {
            selectedType: AuthType.GeminiAPIKey,
          },
        },
      },
    } as LoadedSettings;

    mockConfig = {
      refreshAuth: vi.fn().mockResolvedValue(undefined),
    } as unknown as Config;

    consoleLogSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => undefined);

    vi.mocked(authModule.validateAuthMethod).mockReturnValue(null);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start with Unauthenticated state', () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      expect(result.current.authState).toBe(AuthState.Unauthenticated);
    });

    it('should start with null error', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toBeNull();
      });
    });

    it('should provide setAuthState function', () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      expect(result.current.setAuthState).toBeDefined();
      expect(typeof result.current.setAuthState).toBe('function');
    });

    it('should provide onAuthError function', () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      expect(result.current.onAuthError).toBeDefined();
      expect(typeof result.current.onAuthError).toBe('function');
    });
  });

  describe('successful authentication', () => {
    it('should transition to Authenticated state', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Authenticated);
      });
    });

    it('should call config.refreshAuth with auth type', async () => {
      renderHook(() => useAuthCommand(mockSettings, mockConfig));

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.GeminiAPIKey,
        );
      });
    });

    it('should log authentication success', async () => {
      renderHook(() => useAuthCommand(mockSettings, mockConfig));

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Authenticated via'),
        );
      });
    });

    it('should include auth type in log message', async () => {
      renderHook(() => useAuthCommand(mockSettings, mockConfig));

      await waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining(AuthType.GeminiAPIKey),
        );
      });
    });

    it('should clear auth error on success', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toBeNull();
      });
    });
  });

  describe('authentication failures', () => {
    it('should handle refreshAuth error', async () => {
      mockConfig.refreshAuth = vi
        .fn()
        .mockRejectedValue(new Error('Auth failed'));

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain('Failed to login');
      });
    });

    it('should include error message in auth error', async () => {
      mockConfig.refreshAuth = vi
        .fn()
        .mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain('Network error');
      });
    });

    it('should set state to Updating on error', async () => {
      mockConfig.refreshAuth = vi
        .fn()
        .mockRejectedValue(new Error('Auth failed'));

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });

    it('should not log on error', async () => {
      mockConfig.refreshAuth = vi
        .fn()
        .mockRejectedValue(new Error('Auth failed'));

      renderHook(() => useAuthCommand(mockSettings, mockConfig));

      await waitFor(() => {
        expect(consoleLogSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('missing auth type', () => {
    it('should set error when no auth type selected', async () => {
      mockSettings.merged.security!.auth!.selectedType = undefined;

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain(
          'No authentication method selected',
        );
      });
    });

    it('should detect GEMINI_API_KEY env var', async () => {
      mockSettings.merged.security!.auth!.selectedType = undefined;
      process.env['GEMINI_API_KEY'] = 'test-key';

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain('Existing API key detected');
      });
    });

    it('should suggest using Gemini API Key when env var exists', async () => {
      mockSettings.merged.security!.auth!.selectedType = undefined;
      process.env['GEMINI_API_KEY'] = 'test-key';

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain(
          'Select "Gemini API Key" option',
        );
      });
    });

    it('should not call refreshAuth when no auth type', async () => {
      mockSettings.merged.security!.auth!.selectedType = undefined;

      renderHook(() => useAuthCommand(mockSettings, mockConfig));

      await waitFor(() => {
        expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
      });
    });
  });

  describe('auth validation errors', () => {
    it('should set error when validation fails', async () => {
      vi.mocked(authModule.validateAuthMethod).mockReturnValue(
        'Validation error',
      );

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toBe('Validation error');
      });
    });

    it('should not call refreshAuth on validation error', async () => {
      vi.mocked(authModule.validateAuthMethod).mockReturnValue(
        'Validation error',
      );

      renderHook(() => useAuthCommand(mockSettings, mockConfig));

      await waitFor(() => {
        expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
      });
    });

    it('should set state to Updating on validation error', async () => {
      vi.mocked(authModule.validateAuthMethod).mockReturnValue(
        'Validation error',
      );

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });
  });

  describe('GEMINI_DEFAULT_AUTH_TYPE validation', () => {
    it('should accept valid GEMINI_DEFAULT_AUTH_TYPE', async () => {
      process.env['GEMINI_DEFAULT_AUTH_TYPE'] = AuthType.GeminiAPIKey;

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Authenticated);
      });
    });

    it('should reject invalid GEMINI_DEFAULT_AUTH_TYPE', async () => {
      process.env['GEMINI_DEFAULT_AUTH_TYPE'] = 'invalid-type';

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain(
          'Invalid value for GEMINI_DEFAULT_AUTH_TYPE',
        );
      });
    });

    it('should include invalid value in error message', async () => {
      process.env['GEMINI_DEFAULT_AUTH_TYPE'] = 'bad-auth';

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain('bad-auth');
      });
    });

    it('should list valid auth types in error', async () => {
      process.env['GEMINI_DEFAULT_AUTH_TYPE'] = 'invalid';

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain('Valid values are');
      });
    });

    it('should not call refreshAuth with invalid default', async () => {
      process.env['GEMINI_DEFAULT_AUTH_TYPE'] = 'invalid';

      renderHook(() => useAuthCommand(mockSettings, mockConfig));

      await waitFor(() => {
        expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
      });
    });
  });

  describe('onAuthError callback', () => {
    it('should update error when called', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Authenticated);
      });

      act(() => {
        result.current.onAuthError('Custom error');
      });

      expect(result.current.authError).toBe('Custom error');
    });

    it('should set state to Updating', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Authenticated);
      });

      act(() => {
        result.current.onAuthError('Error');
      });

      expect(result.current.authState).toBe(AuthState.Updating);
    });

    it('should be stable across renders', () => {
      const { result, rerender } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      const firstCallback = result.current.onAuthError;
      rerender();
      const secondCallback = result.current.onAuthError;

      expect(firstCallback).toBe(secondCallback);
    });
  });

  describe('state transitions', () => {
    it('should allow manual state change', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Authenticated);
      });

      act(() => {
        result.current.setAuthState(AuthState.Unauthenticated);
      });

      expect(result.current.authState).toBe(AuthState.Unauthenticated);
    });

    it('should not re-authenticate when already authenticated', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Authenticated);
      });

      const callCount = vi.mocked(mockConfig.refreshAuth).mock.calls.length;

      act(() => {
        result.current.setAuthState(AuthState.Authenticated);
      });

      expect(mockConfig.refreshAuth).toHaveBeenCalledTimes(callCount);
    });

    it('should not re-authenticate when state is Updating', async () => {
      mockConfig.refreshAuth = vi.fn().mockRejectedValue(new Error('Error'));

      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Updating);
      });

      expect(mockConfig.refreshAuth).toHaveBeenCalledTimes(1);
    });
  });

  describe('different auth types', () => {
    it('should handle ApplicationDefaultCredentials', async () => {
      mockSettings.merged.security!.auth!.selectedType =
        AuthType.ApplicationDefaultCredentials;

      renderHook(() => useAuthCommand(mockSettings, mockConfig));

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.ApplicationDefaultCredentials,
        );
      });
    });

    it('should handle GCloudCLI auth type', async () => {
      mockSettings.merged.security!.auth!.selectedType = AuthType.GCloudCLI;

      renderHook(() => useAuthCommand(mockSettings, mockConfig));

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(AuthType.GCloudCLI);
      });
    });
  });

  describe('return value structure', () => {
    it('should return object with required properties', () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      expect(result.current).toHaveProperty('authState');
      expect(result.current).toHaveProperty('setAuthState');
      expect(result.current).toHaveProperty('authError');
      expect(result.current).toHaveProperty('onAuthError');
    });

    it('should have correct property types', () => {
      const { result } = renderHook(() =>
        useAuthCommand(mockSettings, mockConfig),
      );

      expect(typeof result.current.authState).toBe('string');
      expect(typeof result.current.setAuthState).toBe('function');
      expect(typeof result.current.onAuthError).toBe('function');
      expect(
        typeof result.current.authError === 'string' ||
          result.current.authError === null,
      ).toBe(true);
    });
  });
});
