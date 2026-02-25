/**
 * @license
 * Copyright 2026 Google LLC
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
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '@google/gemini-cli-core';
import { useQuotaAndFallback } from './useQuotaAndFallback.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';

// Use a type alias for SpyInstance as it's not directly exported
type SpyInstance = ReturnType<typeof vi.spyOn>;

describe('useQuotaAndFallback', () => {
  let mockConfig: Config;
  let mockHistoryManager: UseHistoryManagerReturn;
  let mockSetModelSwitchedFromQuotaError: Mock;
  let mockOnShowAuthSelection: Mock;
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

    mockHistoryManager = {
      addItem: vi.fn(),
      history: [],
      updateItem: vi.fn(),
      clearItems: vi.fn(),
      loadHistory: vi.fn(),
    };
    mockSetModelSwitchedFromQuotaError = vi.fn();
    mockOnShowAuthSelection = vi.fn();

    setFallbackHandlerSpy = vi.spyOn(mockConfig, 'setFallbackModelHandler');
    vi.spyOn(mockConfig, 'setQuotaErrorOccurred');
    vi.spyOn(mockConfig, 'setModel');
    vi.spyOn(mockConfig, 'setActiveModel');
    vi.spyOn(mockConfig, 'activateFallbackMode');
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
        onShowAuthSelection: mockOnShowAuthSelection,
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
          onShowAuthSelection: mockOnShowAuthSelection,
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
            onShowAuthSelection: mockOnShowAuthSelection,
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
        act(() => {
          promise = handler('gemini-pro', 'gemini-flash', error);
        });

        // The hook should now have a pending request for the UI to handle
        const request = result.current.proQuotaRequest;
        expect(request).not.toBeNull();
        expect(request?.failedModel).toBe('gemini-pro');
        expect(request?.isTerminalQuotaError).toBe(true);

        const message = request!.message;
        expect(message).toContain('Usage limit reached for all Pro models.');
        expect(message).toContain('Access resets at'); // From getResetTimeMessage
        expect(message).toContain('/stats model for usage details');
        expect(message).toContain('/model to switch models.');
        expect(message).toContain('/auth to switch to API key.');

        expect(mockHistoryManager.addItem).not.toHaveBeenCalled();

        // Simulate the user choosing to continue with the fallback model
        act(() => {
          result.current.handleProQuotaChoice('retry_always');
        });

        // The original promise from the handler should now resolve
        const intent = await promise!;
        expect(intent).toBe('retry_always');

        // The pending request should be cleared from the state
        expect(result.current.proQuotaRequest).toBeNull();
        expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      });

      it('should show the model name for a terminal quota error on a non-pro model', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            onShowAuthSelection: mockOnShowAuthSelection,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        let promise: Promise<FallbackIntent | null>;
        const error = new TerminalQuotaError(
          'flash quota',
          mockGoogleApiError,
          1000 * 60 * 5,
        );
        act(() => {
          promise = handler('gemini-flash', 'gemini-pro', error);
        });

        const request = result.current.proQuotaRequest;
        expect(request).not.toBeNull();
        expect(request?.failedModel).toBe('gemini-flash');

        const message = request!.message;
        expect(message).toContain('Usage limit reached for gemini-flash.');
        expect(message).not.toContain('all Pro models');

        act(() => {
          result.current.handleProQuotaChoice('retry_later');
        });

        await promise!;
      });

      it('should handle terminal quota error without retry delay', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            onShowAuthSelection: mockOnShowAuthSelection,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        let promise: Promise<FallbackIntent | null>;
        const error = new TerminalQuotaError('no delay', mockGoogleApiError);
        act(() => {
          promise = handler('gemini-pro', 'gemini-flash', error);
        });

        const request = result.current.proQuotaRequest;
        const message = request!.message;
        expect(message).not.toContain('Access resets at');
        expect(message).toContain('Usage limit reached for all Pro models.');

        act(() => {
          result.current.handleProQuotaChoice('retry_later');
        });

        await promise!;
      });

      it('should handle race conditions by stopping subsequent requests', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            onShowAuthSelection: mockOnShowAuthSelection,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        let promise1: Promise<FallbackIntent | null>;
        act(() => {
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

        act(() => {
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
              onShowAuthSelection: mockOnShowAuthSelection,
            }),
          );

          const handler = setFallbackHandlerSpy.mock
            .calls[0][0] as FallbackModelHandler;

          let promise: Promise<FallbackIntent | null>;
          act(() => {
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
            'We are currently experiencing high demand.',
          );

          // Simulate the user choosing to continue with the fallback model
          act(() => {
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
          expect(lastCall.text).toContain('Switched to fallback model model-B');
        });
      }

      it('should handle ModelNotFoundError correctly', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            onShowAuthSelection: mockOnShowAuthSelection,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        let promise: Promise<FallbackIntent | null>;
        const error = new ModelNotFoundError('model not found', 404);

        act(() => {
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
          `It seems like you don't have access to gemini-3-pro-preview.
Your admin might have disabled the access. Contact them to enable the Preview Release Channel.`,
        );

        // Simulate the user choosing to switch
        act(() => {
          result.current.handleProQuotaChoice('retry_always');
        });

        const intent = await promise!;
        expect(intent).toBe('retry_always');

        expect(result.current.proQuotaRequest).toBeNull();
      });

      it('should handle ModelNotFoundError with invalid model correctly', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
            onShowAuthSelection: mockOnShowAuthSelection,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        let promise: Promise<FallbackIntent | null>;
        const error = new ModelNotFoundError('model not found', 404);

        act(() => {
          promise = handler('invalid-model', 'gemini-2.5-pro', error);
        });

        const request = result.current.proQuotaRequest;
        expect(request).not.toBeNull();
        expect(request?.failedModel).toBe('invalid-model');
        expect(request?.isModelNotFoundError).toBe(true);

        const message = request!.message;
        expect(message).toBe(
          `Model "invalid-model" was not found or is invalid.
/model to switch models.`,
        );

        act(() => {
          result.current.handleProQuotaChoice('retry_always');
        });

        const intent = await promise!;
        expect(intent).toBe('retry_always');
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
          onShowAuthSelection: mockOnShowAuthSelection,
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
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      let promise: Promise<FallbackIntent | null>;
      act(() => {
        promise = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota', mockGoogleApiError),
        );
      });

      act(() => {
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
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;

      let promise: Promise<FallbackIntent | null>;
      act(() => {
        promise = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota', mockGoogleApiError),
        );
      });

      act(() => {
        result.current.handleProQuotaChoice('retry_always');
      });

      const intent = await promise!;
      expect(intent).toBe('retry_always');
      expect(result.current.proQuotaRequest).toBeNull();

      // Verify quota error flags are reset
      expect(mockSetModelSwitchedFromQuotaError).toHaveBeenCalledWith(false);
      expect(mockConfig.setQuotaErrorOccurred).toHaveBeenCalledWith(false);

      // Check for the "Switched to fallback model" message
      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
      expect(lastCall.type).toBe(MessageType.INFO);
      expect(lastCall.text).toContain(
        'Switched to fallback model gemini-flash',
      );
    });

    it('should show a special message when falling back from the preview model', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      let promise: Promise<FallbackIntent | null>;
      act(() => {
        promise = handler(
          PREVIEW_GEMINI_MODEL,
          DEFAULT_GEMINI_MODEL,
          new Error('preview model failed'),
        );
      });

      act(() => {
        result.current.handleProQuotaChoice('retry_always');
      });

      await promise!;

      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
      expect(lastCall.type).toBe(MessageType.INFO);
      expect(lastCall.text).toContain(
        `Switched to fallback model gemini-2.5-pro`,
      );
    });

    it('should show a special message when falling back from the preview model, but do not show periodical check message for flash model fallback', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      let promise: Promise<FallbackIntent | null>;
      act(() => {
        promise = handler(
          PREVIEW_GEMINI_MODEL,
          DEFAULT_GEMINI_FLASH_MODEL,
          new Error('preview model failed'),
        );
      });

      act(() => {
        result.current.handleProQuotaChoice('retry_always');
      });

      await promise!;

      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
      const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[0][0];
      expect(lastCall.type).toBe(MessageType.INFO);
      expect(lastCall.text).toContain(
        `Switched to fallback model gemini-2.5-flash`,
      );
    });
  });

  describe('Validation Handler', () => {
    let setValidationHandlerSpy: SpyInstance;

    beforeEach(() => {
      setValidationHandlerSpy = vi.spyOn(mockConfig, 'setValidationHandler');
    });

    it('should register a validation handler on initialization', () => {
      renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      expect(setValidationHandlerSpy).toHaveBeenCalledTimes(1);
      expect(setValidationHandlerSpy.mock.calls[0][0]).toBeInstanceOf(Function);
    });

    it('should set a validation request when handler is called', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      const handler = setValidationHandlerSpy.mock.calls[0][0] as (
        validationLink?: string,
        validationDescription?: string,
        learnMoreUrl?: string,
      ) => Promise<'verify' | 'change_auth' | 'cancel'>;

      let promise: Promise<'verify' | 'change_auth' | 'cancel'>;
      act(() => {
        promise = handler(
          'https://example.com/verify',
          'Please verify',
          'https://example.com/help',
        );
      });

      const request = result.current.validationRequest;
      expect(request).not.toBeNull();
      expect(request?.validationLink).toBe('https://example.com/verify');
      expect(request?.validationDescription).toBe('Please verify');
      expect(request?.learnMoreUrl).toBe('https://example.com/help');

      // Simulate user choosing verify
      act(() => {
        result.current.handleValidationChoice('verify');
      });

      const intent = await promise!;
      expect(intent).toBe('verify');
      expect(result.current.validationRequest).toBeNull();
    });

    it('should handle race conditions by returning cancel for subsequent requests', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      const handler = setValidationHandlerSpy.mock.calls[0][0] as (
        validationLink?: string,
      ) => Promise<'verify' | 'change_auth' | 'cancel'>;

      let promise1: Promise<'verify' | 'change_auth' | 'cancel'>;
      act(() => {
        promise1 = handler('https://example.com/verify1');
      });

      const firstRequest = result.current.validationRequest;
      expect(firstRequest).not.toBeNull();

      let result2: 'verify' | 'change_auth' | 'cancel';
      await act(async () => {
        result2 = await handler('https://example.com/verify2');
      });

      // The lock should have stopped the second request
      expect(result2!).toBe('cancel');
      expect(result.current.validationRequest).toBe(firstRequest);

      // Complete the first request
      act(() => {
        result.current.handleValidationChoice('verify');
      });

      const intent1 = await promise1!;
      expect(intent1).toBe('verify');
      expect(result.current.validationRequest).toBeNull();
    });

    it('should call onShowAuthSelection when change_auth is chosen', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      const handler = setValidationHandlerSpy.mock.calls[0][0] as (
        validationLink?: string,
      ) => Promise<'verify' | 'change_auth' | 'cancel'>;

      let promise: Promise<'verify' | 'change_auth' | 'cancel'>;
      act(() => {
        promise = handler('https://example.com/verify');
      });

      act(() => {
        result.current.handleValidationChoice('change_auth');
      });

      const intent = await promise!;
      expect(intent).toBe('change_auth');

      expect(mockOnShowAuthSelection).toHaveBeenCalledTimes(1);
    });

    it('should call onShowAuthSelection when cancel is chosen', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      const handler = setValidationHandlerSpy.mock.calls[0][0] as (
        validationLink?: string,
      ) => Promise<'verify' | 'change_auth' | 'cancel'>;

      let promise: Promise<'verify' | 'change_auth' | 'cancel'>;
      act(() => {
        promise = handler('https://example.com/verify');
      });

      act(() => {
        result.current.handleValidationChoice('cancel');
      });

      const intent = await promise!;
      expect(intent).toBe('cancel');

      expect(mockOnShowAuthSelection).toHaveBeenCalledTimes(1);
    });

    it('should do nothing if handleValidationChoice is called without pending request', () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          onShowAuthSelection: mockOnShowAuthSelection,
        }),
      );

      act(() => {
        result.current.handleValidationChoice('verify');
      });

      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
    });
  });
});
