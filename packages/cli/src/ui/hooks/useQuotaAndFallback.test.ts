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
import { act, renderHook } from '@testing-library/react';
import {
  type Config,
  type FallbackModelHandler,
  UserTierId,
  AuthType,
  TerminalQuotaError,
  makeFakeConfig,
  type GoogleApiError,
} from '@google/gemini-cli-core';
import { useQuotaAndFallback } from './useQuotaAndFallback.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import { AuthState, MessageType } from '../types.js';

// Use a type alias for SpyInstance as it's not directly exported
type SpyInstance = ReturnType<typeof vi.spyOn>;

describe('useQuotaAndFallback', () => {
  let mockConfig: Config;
  let mockHistoryManager: UseHistoryManagerReturn;
  let mockSetAuthState: Mock;
  let mockSetModelSwitchedFromQuotaError: Mock;
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
    mockSetAuthState = vi.fn();
    mockSetModelSwitchedFromQuotaError = vi.fn();

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
        setAuthState: mockSetAuthState,
        setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
      }),
    );

    expect(setFallbackHandlerSpy).toHaveBeenCalledTimes(1);
    expect(setFallbackHandlerSpy.mock.calls[0][0]).toBeInstanceOf(Function);
  });

  describe('Fallback Handler Logic', () => {
    // Helper function to render the hook and extract the registered handler
    const getRegisteredHandler = (
      userTier: UserTierId = UserTierId.FREE,
    ): FallbackModelHandler => {
      renderHook(
        (props) =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: props.userTier,
            setAuthState: mockSetAuthState,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          }),
        { initialProps: { userTier } },
      );
      return setFallbackHandlerSpy.mock.calls[0][0] as FallbackModelHandler;
    };

    it('should return null and take no action if already in fallback mode', async () => {
      vi.spyOn(mockConfig, 'isInFallbackMode').mockReturnValue(true);
      const handler = getRegisteredHandler();
      const result = await handler('gemini-pro', 'gemini-flash', new Error());

      expect(result).toBeNull();
      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
    });

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

    describe('Automatic Fallback Scenarios', () => {
      const testCases = [
        {
          errorType: 'other',
          tier: UserTierId.FREE,
          expectedMessageSnippets: [
            'Automatically switching from model-A to model-B for faster responses',
            'upgrade to a Gemini Code Assist Standard or Enterprise plan',
          ],
        },
        {
          errorType: 'other',
          tier: UserTierId.LEGACY, // Paid tier
          expectedMessageSnippets: [
            'Automatically switching from model-A to model-B for faster responses',
            'switch to using a paid API key from AI Studio',
          ],
        },
      ];

      for (const { errorType, tier, expectedMessageSnippets } of testCases) {
        it(`should handle ${errorType} error for ${tier} tier correctly`, async () => {
          const handler = getRegisteredHandler(tier);
          const result = await handler(
            'model-A',
            'model-B',
            new Error('some error'),
          );

          // Automatic fallbacks should return 'stop'
          expect(result).toBe('stop');

          expect(mockHistoryManager.addItem).toHaveBeenCalledWith(
            expect.objectContaining({ type: MessageType.INFO }),
            expect.any(Number),
          );

          const message = (mockHistoryManager.addItem as Mock).mock.calls[0][0]
            .text;
          for (const snippet of expectedMessageSnippets) {
            expect(message).toContain(snippet);
          }

          expect(mockSetModelSwitchedFromQuotaError).toHaveBeenCalledWith(true);
          expect(mockConfig.setQuotaErrorOccurred).toHaveBeenCalledWith(true);
        });
      }
    });

    describe('Interactive Fallback (Pro Quota Error)', () => {
      it('should set an interactive request and wait for user choice', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setAuthState: mockSetAuthState,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        // Call the handler but do not await it, to check the intermediate state
        const promise = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota', mockGoogleApiError),
        );

        await act(async () => {});

        // The hook should now have a pending request for the UI to handle
        expect(result.current.proQuotaRequest).not.toBeNull();
        expect(result.current.proQuotaRequest?.failedModel).toBe('gemini-pro');

        // Simulate the user choosing to continue with the fallback model
        act(() => {
          result.current.handleProQuotaChoice('continue');
        });

        // The original promise from the handler should now resolve
        const intent = await promise;
        expect(intent).toBe('retry');

        // The pending request should be cleared from the state
        expect(result.current.proQuotaRequest).toBeNull();
      });

      it('should handle race conditions by stopping subsequent requests', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setAuthState: mockSetAuthState,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        const promise1 = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota 1', mockGoogleApiError),
        );
        await act(async () => {});

        const firstRequest = result.current.proQuotaRequest;
        expect(firstRequest).not.toBeNull();

        const result2 = await handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota 2', mockGoogleApiError),
        );

        // The lock should have stopped the second request
        expect(result2).toBe('stop');
        expect(result.current.proQuotaRequest).toBe(firstRequest);

        act(() => {
          result.current.handleProQuotaChoice('continue');
        });

        const intent1 = await promise1;
        expect(intent1).toBe('retry');
        expect(result.current.proQuotaRequest).toBeNull();
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
          setAuthState: mockSetAuthState,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
        }),
      );

      act(() => {
        result.current.handleProQuotaChoice('auth');
      });

      expect(mockSetAuthState).not.toHaveBeenCalled();
      expect(mockHistoryManager.addItem).not.toHaveBeenCalled();
    });

    it('should resolve intent to "auth" and trigger auth state update', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setAuthState: mockSetAuthState,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      const promise = handler(
        'gemini-pro',
        'gemini-flash',
        new TerminalQuotaError('pro quota', mockGoogleApiError),
      );
      await act(async () => {}); // Allow state to update

      act(() => {
        result.current.handleProQuotaChoice('auth');
      });

      const intent = await promise;
      expect(intent).toBe('auth');
      expect(mockSetAuthState).toHaveBeenCalledWith(AuthState.Updating);
      expect(result.current.proQuotaRequest).toBeNull();
    });

    it('should resolve intent to "retry" and add info message on continue', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setAuthState: mockSetAuthState,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      // The first `addItem` call is for the initial quota error message
      const promise = handler(
        'gemini-pro',
        'gemini-flash',
        new TerminalQuotaError('pro quota', mockGoogleApiError),
      );
      await act(async () => {}); // Allow state to update

      act(() => {
        result.current.handleProQuotaChoice('continue');
      });

      const intent = await promise;
      expect(intent).toBe('retry');
      expect(result.current.proQuotaRequest).toBeNull();

      // Check for the second "Switched to fallback model" message
      expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(2);
      const lastCall = (mockHistoryManager.addItem as Mock).mock.calls[1][0];
      expect(lastCall.type).toBe(MessageType.INFO);
      expect(lastCall.text).toContain('Switched to fallback model.');
    });
  });
});
