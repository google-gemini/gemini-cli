/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import {
  type Config,
  type FallbackModelHandler,
  type FallbackIntent,
  UserTierId,
  AuthType,
  TerminalQuotaError,
  makeFakeConfig,
  type GoogleApiError,
  RetryableQuotaError,
  PREVIEW_GEMINI_MODEL,
  ModelNotFoundError,
} from '@google/gemini-cli-core';
import { useQuotaAndFallback } from './useQuotaAndFallback.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';
import { type LoadedSettings, SettingScope } from '../../config/settings.js';

// Use a type alias for SpyInstance as it's not directly exported
type SpyInstance = ReturnType<typeof vi.spyOn>;

describe('useQuotaAndFallback', () => {
  let mockConfig: Config;
  let mockHistoryManager: UseHistoryManagerReturn;
  let mockSetModelSwitchedFromQuotaError: Mock;
  let mockSettings: LoadedSettings;
  let setFallbackHandlerSpy: SpyInstance;
  let mockGoogleApiError: GoogleApiError;

  beforeEach(() => {
    mockConfig = makeFakeConfig();
    mockGoogleApiError = {
      code: 429,
      message: 'mock error',
      details: [],
    };

    // Spy on the method that requires the private field and mock its return.
    // This is cleaner than modifying the config class for tests.
    vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue({
      authType: AuthType.LOGIN_WITH_GOOGLE,
    });
    vi.spyOn(mockConfig, 'refreshAuth').mockResolvedValue(undefined);

    mockHistoryManager = {
      addItem: vi.fn(),
      history: [],
      updateItem: vi.fn(),
      clearItems: vi.fn(),
      loadHistory: vi.fn(),
    };
    mockSetModelSwitchedFromQuotaError = vi.fn();

    mockSettings = {
      setValue: vi.fn().mockResolvedValue(undefined),
      merged: {},
    } as unknown as LoadedSettings;

    setFallbackHandlerSpy = vi.spyOn(mockConfig, 'setFallbackModelHandler');
    vi.spyOn(mockConfig, 'setQuotaErrorOccurred');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should register a fallback handler on initialization', () => {
    renderHook(() =>
      useQuotaAndFallback({
        config: mockConfig,
        historyManager: mockHistoryManager,
        userTier: UserTierId.FREE,
        setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
        settings: mockSettings,
      }),
    );

    expect(setFallbackHandlerSpy).toHaveBeenCalledTimes(1);
    expect(setFallbackHandlerSpy.mock.calls[0][0]).toBeInstanceOf(Function);
  });

  describe('Fallback Handler Logic', () => {
    // Helper function to render the hook and extract the registered handler
    const getRegisteredHandler = (): FallbackModelHandler => {
      renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          settings: mockSettings,
        }),
      );
      return setFallbackHandlerSpy.mock.calls[0][0] as FallbackModelHandler;
    };

    it('should return null and take no action if authType is not LOGIN_WITH_GOOGLE', async () => {
      // Override the default mock from beforeEach for this specific test
      vi.spyOn(mockConfig, 'getContentGeneratorConfig').mockReturnValue({
        authType: AuthType.USE_GEMINI,
      });

      const handler = getRegisteredHandler();
      const result = await handler('gemini-pro', 'gemini-flash', new Error());

      expect(result).toBeNull();
      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
    });

    describe('Interactive Fallback', () => {
      it('should set an interactive request for a terminal quota error', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            settings: mockSettings,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        let promise: Promise<FallbackIntent | null>;
        const error = new TerminalQuotaError(
          'pro quota',
          mockGoogleApiError,
          1000 * 60 * 5,
        ); // 5 minutes
        await act(() => {
          promise = handler('gemini-pro', 'gemini-flash', error);
        });

        // The hook should now have a pending request for the UI to handle
        const request = result.current.proQuotaRequest;
        expect(request).not.toBeNull();
        expect(request?.failedModel).toBe('gemini-pro');
        expect(request?.isTerminalQuotaError).toBe(true);

        const message = request!.message;
        expect(message).toContain('Usage limit reached for gemini-pro.');
        expect(message).toContain('Access resets at'); // From getResetTimeMessage
        expect(message).toContain('/stats for usage details');
        expect(message).toContain('/auth to switch to API key.');

        expect(mockHistoryManager.addItem).not.toHaveBeenCalled();

        // Simulate the user choosing to continue with the fallback model
        await act(() => {
          result.current.handleProQuotaChoice('retry_always');
        });

        // The original promise from the handler should now resolve
        const intent = await promise!;
        expect(intent).toBe('retry_always');

        // The pending request should be cleared from the state
        expect(result.current.proQuotaRequest).toBeNull();
        expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      });

      it('should handle race conditions by stopping subsequent requests', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            settings: mockSettings,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        let promise1: Promise<FallbackIntent | null>;
        await act(() => {
          promise1 = handler(
            'gemini-pro',
            'gemini-flash',
            new TerminalQuotaError('pro quota 1', mockGoogleApiError),
          );
        });

        const firstRequest = result.current.proQuotaRequest;
        expect(firstRequest).not.toBeNull();

        let result2: FallbackIntent | null;
        await act(async () => {
          result2 = await handler(
            'gemini-pro',
            'gemini-flash',
            new TerminalQuotaError('pro quota 2', mockGoogleApiError),
          );
        });

        // The lock should have stopped the second request
        expect(result2!).toBe('stop');
        expect(result.current.proQuotaRequest).toBe(firstRequest);

        await act(() => {
          result.current.handleProQuotaChoice('retry_always');
        });

        const intent1 = await promise1!;
        expect(intent1).toBe('retry_always');
        expect(result.current.proQuotaRequest).toBeNull();
      });

      // Non-TerminalQuotaError test cases
      const testCases = [
        {
          description: 'generic error',
          error: new Error('some error'),
        },
        {
          description: 'retryable quota error',
          error: new RetryableQuotaError(
            'retryable quota',
            mockGoogleApiError,
            5,
          ),
        },
      ];

      for (const { description, error } of testCases) {
        it(`should handle ${description} correctly`, async () => {
          const { result } = renderHook(() =>
            useQuotaAndFallback({
              config: mockConfig,
              historyManager: mockHistoryManager,
              userTier: UserTierId.FREE,
              setModelSwitchedFromQuotaError:
                mockSetModelSwitchedFromQuotaError,
              settings: mockSettings,
            }),
          );

          const handler = setFallbackHandlerSpy.mock
            .calls[0][0] as FallbackModelHandler;

          let promise: Promise<FallbackIntent | null>;
          await act(() => {
            promise = handler('model-A', 'model-B', error);
          });

          // The hook should now have a pending request for the UI to handle
          const request = result.current.proQuotaRequest;
          expect(request).not.toBeNull();
          expect(request?.failedModel).toBe('model-A');
          expect(request?.isTerminalQuotaError).toBe(false);

          // Check that the correct initial message was generated
          expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
          const message = request!.message;
          expect(message).toContain(
            'model-A is currently experiencing high demand. We apologize and appreciate your patience.',
          );

          // Simulate the user choosing to continue with the fallback model
          await act(() => {
            result.current.handleProQuotaChoice('retry_always');
          });

          expect(mockSetModelSwitchedFromQuotaError).toHaveBeenCalledWith(true);
          // The original promise from the handler should now resolve
          const intent = await promise!;
          expect(intent).toBe('retry_always');

          // The pending request should be cleared from the state
          expect(result.current.proQuotaRequest).toBeNull();
          expect(mockConfig.setQuotaErrorOccurred).toHaveBeenCalledWith(true);

          // Check for the "Switched to fallback model" message
          expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
          const lastCall = (mockHistoryManager.addItem as Mock).mock
            .calls[0][0];
          expect(lastCall.type).toBe(MessageType.INFO);
          expect(lastCall.text).toContain('Switched to fallback model.');
        });
      }

      it('should handle ModelNotFoundError correctly', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            settings: mockSettings,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        let promise: Promise<FallbackIntent | null>;
        const error = new ModelNotFoundError('model not found', 404);

        await act(() => {
          promise = handler('gemini-3-pro-preview', 'gemini-2.5-pro', error);
        });

        // The hook should now have a pending request for the UI to handle
        const request = result.current.proQuotaRequest;
        expect(request).not.toBeNull();
        expect(request?.failedModel).toBe('gemini-3-pro-preview');
        expect(request?.isTerminalQuotaError).toBe(false);
        expect(request?.isModelNotFoundError).toBe(true);

        const message = request!.message;
        expect(message).toBe(
          `It seems like you don't have access to Gemini 3.
Learn more at https://goo.gle/enable-preview-features
To disable Gemini 3, disable "Preview features" in /settings.`,
        );

        // Simulate the user choosing to switch
        await act(() => {
          result.current.handleProQuotaChoice('retry_always');
        });

        const intent = await promise!;
        expect(intent).toBe('retry_always');
        expect(result.current.proQuotaRequest).toBeNull();
      });

      it('should handle auto-fallback success correctly', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            settings: mockSettings,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        const autoFallbackStatus = {
          status: 'success' as const,
          authType: 'gemini-api-key' as const,
        };

        let intent: FallbackIntent | null;
        await act(async () => {
          intent = await handler(
            'gemini-pro',
            'gemini-flash',
            new TerminalQuotaError('pro quota', mockGoogleApiError),
            autoFallbackStatus,
          );
        });

        // Should return retry_once immediately without showing dialog
        expect(intent!).toBe('retry_once');
        expect(result.current.proQuotaRequest).toBeNull();

        // Should add success message to history
        expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
        const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
        expect(lastCall.type).toBe(MessageType.INFO);
        expect(lastCall.text).toContain(
          '✓ Automatically switched to Gemini API key authentication',
        );
      });

      it('should handle auto-fallback missing-env-vars correctly', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            settings: mockSettings,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        const autoFallbackStatus = {
          status: 'missing-env-vars' as const,
          authType: 'gemini-api-key' as const,
        };

        let promise: Promise<FallbackIntent | null>;
        await act(() => {
          promise = handler(
            'gemini-pro',
            'gemini-flash',
            new TerminalQuotaError('pro quota', mockGoogleApiError),
            autoFallbackStatus,
          );
        });

        // Should show dialog
        expect(result.current.proQuotaRequest).not.toBeNull();

        // Should add warning message to history
        expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
        const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
        expect(lastCall.type).toBe(MessageType.INFO);
        expect(lastCall.text).toContain(
          'Auto-fallback to Gemini API key is enabled but environment variables are missing',
        );

        // Resolve dialog to cleanup
        await act(() => {
          result.current.handleProQuotaChoice('retry_later');
        });
        await promise!;
      });
    });
  });

  describe('handleProQuotaChoice', () => {
    it('should do nothing if there is no pending pro quota request', () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          settings: mockSettings,
        }),
      );

      act(() => {
        result.current.handleProQuotaChoice('retry_later');
      });

      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
    });

    it('should resolve intent to "retry_later"', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          settings: mockSettings,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      let promise: Promise<FallbackIntent | null>;
      await act(() => {
        promise = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota', mockGoogleApiError),
        );
      });

      await act(() => {
        result.current.handleProQuotaChoice('retry_later');
      });

      const intent = await promise!;
      expect(intent).toBe('retry_later');
      expect(result.current.proQuotaRequest).toBeNull();
    });

    it('should resolve intent to "retry_always" and add info message on continue', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          settings: mockSettings,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;

      let promise: Promise<FallbackIntent | null>;
      await act(() => {
        promise = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota', mockGoogleApiError),
        );
      });

      await act(() => {
        result.current.handleProQuotaChoice('retry_always');
      });

      const intent = await promise!;
      expect(intent).toBe('retry_always');
      expect(result.current.proQuotaRequest).toBeNull();

      // Check for the "Switched to fallback model" message
      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
      expect(lastCall.type).toBe(MessageType.INFO);
      expect(lastCall.text).toContain('Switched to fallback model.');
    });

    it('should show a special message when falling back from the preview model', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          settings: mockSettings,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      let promise: Promise<FallbackIntent | null>;
      await act(() => {
        promise = handler(
          PREVIEW_GEMINI_MODEL,
          'gemini-flash',
          new Error('preview model failed'),
        );
      });

      await act(() => {
        result.current.handleProQuotaChoice('retry_always');
      });

      await promise!;

      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
      expect(lastCall.type).toBe(MessageType.INFO);
      expect(lastCall.text).toContain(
        `Switched to fallback model gemini-flash. We will periodically check if ${PREVIEW_GEMINI_MODEL} is available again.`,
      );
    });

    it('should handle "gemini-api-key" choice with env var present', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          settings: mockSettings,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      let promise: Promise<FallbackIntent | null>;
      await act(() => {
        promise = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota', mockGoogleApiError),
        );
      });

      await act(async () => {
        await result.current.handleProQuotaChoice('gemini-api-key');
      });

      const intent = await promise!;
      expect(intent).toBe('retry_once');
      expect(result.current.proQuotaRequest).toBeNull();

      // Verify settings were saved
      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'security.auth.autoFallback',
        { enabled: true, type: 'gemini-api-key' },
      );

      // Verify auth refresh was called
      expect(mockConfig.refreshAuth).toHaveBeenCalledWith(AuthType.USE_GEMINI);

      // Verify success message
      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
      expect(lastCall.type).toBe(MessageType.INFO);
      expect(lastCall.text).toContain(
        '✓ Switched to Gemini API key authentication',
      );
    });

    it('should handle "gemini-api-key" choice with missing env var', async () => {
      vi.stubEnv('GEMINI_API_KEY', '');
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          settings: mockSettings,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      let promise: Promise<FallbackIntent | null>;
      await act(() => {
        promise = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota', mockGoogleApiError),
        );
      });

      await act(async () => {
        await result.current.handleProQuotaChoice('gemini-api-key');
      });

      const intent = await promise!;
      expect(intent).toBe('retry_once');

      // Verify settings were saved
      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'security.auth.autoFallback',
        { enabled: true, type: 'gemini-api-key' },
      );

      // Verify auth refresh was NOT called
      expect(mockConfig.refreshAuth).not.toHaveBeenCalled();

      // Verify missing env message
      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
      expect(lastCall.text).toContain(
        'Enabled Gemini API key fallback for future sessions. Set GEMINI_API_KEY',
      );
    });

    it('should handle "vertex-ai" choice with env var present', async () => {
      vi.stubEnv('GOOGLE_API_KEY', 'test-key');
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          settings: mockSettings,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      let promise: Promise<FallbackIntent | null>;
      await act(() => {
        promise = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota', mockGoogleApiError),
        );
      });

      await act(async () => {
        await result.current.handleProQuotaChoice('vertex-ai');
      });

      const intent = await promise!;
      expect(intent).toBe('retry_once');

      // Verify settings were saved
      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'security.auth.autoFallback',
        { enabled: true, type: 'vertex-ai' },
      );

      // Verify auth refresh was called
      expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
        AuthType.USE_VERTEX_AI,
      );

      // Verify success message
      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
      expect(lastCall.text).toContain('✓ Switched to Vertex AI authentication');
    });
  });
});
