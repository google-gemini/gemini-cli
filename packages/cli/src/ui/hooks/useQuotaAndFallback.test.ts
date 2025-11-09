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
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          }),
        { initialProps: { userTier } },
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

    describe('Flash Model Fallback', () => {
      it('should show a terminal quota message and stop, without offering a fallback', async () => {
        const handler = getRegisteredHandler();
        const result = await handler(
          'gemini-2.5-flash',
          'gemini-2.5-flash',
          new TerminalQuotaError('flash quota', mockGoogleApiError),
        );

        expect(result).toBe('stop');
        expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
        const message = (mockHistoryManager.addItem as Mock).mock.calls[0][0]
          .text;
        expect(message).toContain(
          'You have reached your daily gemini-2.5-flash',
        );
        expect(message).not.toContain('continue with the fallback model');
      });

      it('should show a capacity message and stop', async () => {
        const handler = getRegisteredHandler();
        // let result: FallbackIntent | null = null;
        const result = await handler(
          'gemini-2.5-flash',
          'gemini-2.5-flash',
          new Error('capacity'),
        );

        expect(result).toBe('stop');
        expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
        const message = (mockHistoryManager.addItem as Mock).mock.calls[0][0]
          .text;
        expect(message).toContain(
          'Pardon Our Congestion! It looks like gemini-2.5-flash is very popular',
        );
      });

      it('should show a capacity message and stop, even when already in fallback mode', async () => {
        vi.spyOn(mockConfig, 'isInFallbackMode').mockReturnValue(true);
        const handler = getRegisteredHandler();
        const result = await handler(
          'gemini-2.5-flash',
          'gemini-2.5-flash',
          new Error('capacity'),
        );

        expect(result).toBe('stop');
        expect(mockHistoryManager.addItem).toHaveBeenCalledTimes(1);
        const message = (mockHistoryManager.addItem as Mock).mock.calls[0][0]
          .text;
        expect(message).toContain(
          'Pardon Our Congestion! It looks like gemini-2.5-flash is very popular',
        );
      });
    });

    describe('Interactive Fallback', () => {
      // Pro Quota Errors
      it('should set an interactive request and wait for user choice', async () => {
        const { result } = renderHook(() =>
          useQuotaAndFallback({
            config: mockConfig,
            historyManager: mockHistoryManager,
            userTier: UserTierId.FREE,
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
          }),
        );

        const handler = setFallbackHandlerSpy.mock
          .calls[0][0] as FallbackModelHandler;

        // Call the handler but do not await it, to check the intermediate state
        let promise: Promise<FallbackIntent | null>;
        await act(() => {
          promise = handler(
            'gemini-pro',
            'gemini-flash',
            new TerminalQuotaError('pro quota', mockGoogleApiError),
          );
        });

        // The hook should now have a pending request for the UI to handle
        expect(result.current.proQuotaRequest).not.toBeNull();
        expect(result.current.proQuotaRequest?.failedModel).toBe('gemini-pro');

        // Simulate the user choosing to continue with the fallback model
        await act(() => {
          result.current.handleProQuotaChoice('retry');
        });

        // The original promise from the handler should now resolve
        const intent = await promise!;
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
            setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
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
          result.current.handleProQuotaChoice('retry');
        });

        const intent1 = await promise1!;
        expect(intent1).toBe('retry');
        expect(result.current.proQuotaRequest).toBeNull();
      });

      // Non-Quota error test cases
      const testCases = [
        {
          description: 'other error for FREE tier',
          tier: UserTierId.FREE,
          error: new Error('some error'),
          expectedMessageSnippets: [
            '🚦Pardon Our Congestion! It looks like model-A is very popular at the moment.',
            'Please retry again later.',
          ],
        },
        {
          description: 'other error for LEGACY tier',
          tier: UserTierId.LEGACY, // Paid tier
          error: new Error('some error'),
          expectedMessageSnippets: [
            '🚦Pardon Our Congestion! It looks like model-A is very popular at the moment.',
            'Please retry again later.',
          ],
        },
        {
          description: 'retryable quota error for FREE tier',
          tier: UserTierId.FREE,
          error: new RetryableQuotaError(
            'retryable quota',
            mockGoogleApiError,
            5,
          ),
          expectedMessageSnippets: [
            '🚦Pardon Our Congestion! It looks like model-A is very popular at the moment.',
            'Please retry again later.',
          ],
        },
        {
          description: 'retryable quota error for LEGACY tier',
          tier: UserTierId.LEGACY, // Paid tier
          error: new RetryableQuotaError(
            'retryable quota',
            mockGoogleApiError,
            5,
          ),
          expectedMessageSnippets: [
            '🚦Pardon Our Congestion! It looks like model-A is very popular at the moment.',
            'Please retry again later.',
          ],
        },
      ];

      for (const {
        description,
        tier,
        error,
        expectedMessageSnippets,
      } of testCases) {
        it(`should handle ${description} correctly`, async () => {
          const { result } = renderHook(
            (props) =>
              useQuotaAndFallback({
                config: mockConfig,
                historyManager: mockHistoryManager,
                userTier: props.tier,
                setModelSwitchedFromQuotaError:
                  mockSetModelSwitchedFromQuotaError,
              }),
            { initialProps: { tier } },
          );

          const handler = setFallbackHandlerSpy.mock
            .calls[0][0] as FallbackModelHandler;

          // Call the handler but do not await it, to check the intermediate state
          let promise: Promise<FallbackIntent | null>;
          await act(() => {
            promise = handler('model-A', 'model-B', error);
          });

          // The hook should now have a pending request for the UI to handle
          expect(result.current.proQuotaRequest).not.toBeNull();
          expect(result.current.proQuotaRequest?.failedModel).toBe('model-A');

          // Check that the correct initial message was added
          expect(mockHistoryManager.addItem).toHaveBeenCalledWith(
            expect.objectContaining({ type: MessageType.INFO }),
            expect.any(Number),
          );
          const message = (mockHistoryManager.addItem as Mock).mock.calls[0][0]
            .text;
          for (const snippet of expectedMessageSnippets) {
            expect(message).toContain(snippet);
          }

          // Simulate the user choosing to continue with the fallback model
          await act(() => {
            result.current.handleProQuotaChoice('retry');
          });

          expect(mockSetModelSwitchedFromQuotaError).toHaveBeenCalledWith(true);
          // The original promise from the handler should now resolve
          const intent = await promise!;
          expect(intent).toBe('retry');

          // The pending request should be cleared from the state
          expect(result.current.proQuotaRequest).toBeNull();
          expect(mockConfig.setQuotaErrorOccurred).toHaveBeenCalledWith(true);
        });
      }
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

    it('should resolve intent to "retry" and add info message on continue', async () => {
      const { result } = renderHook(() =>
        useQuotaAndFallback({
          config: mockConfig,
          historyManager: mockHistoryManager,
          userTier: UserTierId.FREE,
          setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
        }),
      );

      const handler = setFallbackHandlerSpy.mock
        .calls[0][0] as FallbackModelHandler;
      // The first `addItem` call is for the initial quota error message
      let promise: Promise<FallbackIntent | null>;
      await act(() => {
        promise = handler(
          'gemini-pro',
          'gemini-flash',
          new TerminalQuotaError('pro quota', mockGoogleApiError),
        );
      });

      await act(() => {
        result.current.handleProQuotaChoice('retry');
      });

      const intent = await promise!;
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
