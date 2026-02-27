/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleCreditsFlow } from './creditsFlowHandler.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import {
  type Config,
  type GeminiUserTier,
  makeFakeConfig,
  getG1CreditBalance,
  shouldAutoUseCredits,
  shouldShowOverageMenu,
  shouldShowEmptyWalletMenu,
  logBillingEvent,
  G1_CREDIT_TYPE,
  UserTierId,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    getG1CreditBalance: vi.fn(),
    shouldAutoUseCredits: vi.fn(),
    shouldShowOverageMenu: vi.fn(),
    shouldShowEmptyWalletMenu: vi.fn(),
    logBillingEvent: vi.fn(),
    openBrowserSecurely: vi.fn(),
  };
});

describe('handleCreditsFlow', () => {
  let mockConfig: Config;
  let mockHistoryManager: UseHistoryManagerReturn;
  let isDialogPending: React.MutableRefObject<boolean>;
  let mockSetOverageMenuRequest: ReturnType<typeof vi.fn>;
  let mockSetEmptyWalletRequest: ReturnType<typeof vi.fn>;
  let mockSetModelSwitchedFromQuotaError: ReturnType<typeof vi.fn>;
  const mockPaidTier: GeminiUserTier = {
    id: UserTierId.STANDARD,
    availableCredits: [{ creditType: G1_CREDIT_TYPE, creditAmount: '100' }],
  };

  beforeEach(() => {
    mockConfig = makeFakeConfig();
    mockHistoryManager = {
      addItem: vi.fn(),
      history: [],
      updateItem: vi.fn(),
      clearItems: vi.fn(),
      loadHistory: vi.fn(),
    };
    isDialogPending = { current: false };
    mockSetOverageMenuRequest = vi.fn();
    mockSetEmptyWalletRequest = vi.fn();
    mockSetModelSwitchedFromQuotaError = vi.fn();

    vi.spyOn(mockConfig, 'setQuotaErrorOccurred');
    vi.spyOn(mockConfig, 'setOverageStrategy');

    vi.mocked(getG1CreditBalance).mockReturnValue(100);
    vi.mocked(shouldAutoUseCredits).mockReturnValue(false);
    vi.mocked(shouldShowOverageMenu).mockReturnValue(false);
    vi.mocked(shouldShowEmptyWalletMenu).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeArgs(
    overrides?: Partial<Parameters<typeof handleCreditsFlow>[0]>,
  ) {
    return {
      config: mockConfig,
      paidTier: mockPaidTier,
      overageStrategy: 'ask' as const,
      failedModel: 'gemini-3-pro-preview',
      fallbackModel: 'gemini-3-flash-preview',
      usageLimitReachedModel: 'all Pro models',
      resetTime: '3:45 PM',
      historyManager: mockHistoryManager,
      setModelSwitchedFromQuotaError: mockSetModelSwitchedFromQuotaError,
      isDialogPending,
      setOverageMenuRequest: mockSetOverageMenuRequest,
      setEmptyWalletRequest: mockSetEmptyWalletRequest,
      ...overrides,
    };
  }

  it('should return null if credit balance is null (non-G1 user)', async () => {
    vi.mocked(getG1CreditBalance).mockReturnValue(null);
    const result = await handleCreditsFlow(makeArgs());
    expect(result).toBeNull();
  });

  it('should return null if credits are already auto-used (strategy=always)', async () => {
    vi.mocked(shouldAutoUseCredits).mockReturnValue(true);
    const result = await handleCreditsFlow(makeArgs());
    expect(result).toBeNull();
  });

  it('should show overage menu and return retry_with_credits when use_credits selected', async () => {
    vi.mocked(shouldShowOverageMenu).mockReturnValue(true);

    const flowPromise = handleCreditsFlow(makeArgs());

    // Extract the resolve callback from the setOverageMenuRequest call
    expect(mockSetOverageMenuRequest).toHaveBeenCalledOnce();
    const request = mockSetOverageMenuRequest.mock.calls[0][0];
    expect(request.failedModel).toBe('all Pro models');
    expect(request.creditBalance).toBe(100);

    // Simulate user choosing 'use_credits'
    request.resolve('use_credits');
    const result = await flowPromise;

    expect(result).toBe('retry_with_credits');
    expect(mockConfig.setOverageStrategy).toHaveBeenCalledWith('always');
    expect(logBillingEvent).toHaveBeenCalled();
  });

  it('should show overage menu and return retry_always when use_fallback selected', async () => {
    vi.mocked(shouldShowOverageMenu).mockReturnValue(true);

    const flowPromise = handleCreditsFlow(makeArgs());
    const request = mockSetOverageMenuRequest.mock.calls[0][0];
    request.resolve('use_fallback');
    const result = await flowPromise;

    expect(result).toBe('retry_always');
  });

  it('should show overage menu and return stop when stop selected', async () => {
    vi.mocked(shouldShowOverageMenu).mockReturnValue(true);

    const flowPromise = handleCreditsFlow(makeArgs());
    const request = mockSetOverageMenuRequest.mock.calls[0][0];
    request.resolve('stop');
    const result = await flowPromise;

    expect(result).toBe('stop');
  });

  it('should return stop immediately if dialog is already pending (overage)', async () => {
    vi.mocked(shouldShowOverageMenu).mockReturnValue(true);
    isDialogPending.current = true;

    const result = await handleCreditsFlow(makeArgs());
    expect(result).toBe('stop');
    expect(mockSetOverageMenuRequest).not.toHaveBeenCalled();
  });

  it('should show empty wallet menu and return stop when get_credits selected', async () => {
    vi.mocked(shouldShowEmptyWalletMenu).mockReturnValue(true);

    const flowPromise = handleCreditsFlow(makeArgs());

    expect(mockSetEmptyWalletRequest).toHaveBeenCalledOnce();
    const request = mockSetEmptyWalletRequest.mock.calls[0][0];
    expect(request.failedModel).toBe('all Pro models');

    request.resolve('get_credits');
    const result = await flowPromise;

    expect(result).toBe('stop');
    expect(mockHistoryManager.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.INFO,
        text: expect.stringContaining('few minutes'),
      }),
      expect.any(Number),
    );
  });

  it('should show empty wallet menu and return retry_always when use_fallback selected', async () => {
    vi.mocked(shouldShowEmptyWalletMenu).mockReturnValue(true);

    const flowPromise = handleCreditsFlow(makeArgs());
    const request = mockSetEmptyWalletRequest.mock.calls[0][0];
    request.resolve('use_fallback');
    const result = await flowPromise;

    expect(result).toBe('retry_always');
  });

  it('should return stop immediately if dialog is already pending (empty wallet)', async () => {
    vi.mocked(shouldShowEmptyWalletMenu).mockReturnValue(true);
    isDialogPending.current = true;

    const result = await handleCreditsFlow(makeArgs());
    expect(result).toBe('stop');
    expect(mockSetEmptyWalletRequest).not.toHaveBeenCalled();
  });

  it('should return null if no flow conditions are met', async () => {
    vi.mocked(getG1CreditBalance).mockReturnValue(100);
    vi.mocked(shouldAutoUseCredits).mockReturnValue(false);
    vi.mocked(shouldShowOverageMenu).mockReturnValue(false);
    vi.mocked(shouldShowEmptyWalletMenu).mockReturnValue(false);

    const result = await handleCreditsFlow(makeArgs());
    expect(result).toBeNull();
  });

  it('should clear dialog state after overage menu resolves', async () => {
    vi.mocked(shouldShowOverageMenu).mockReturnValue(true);

    const flowPromise = handleCreditsFlow(makeArgs());
    expect(isDialogPending.current).toBe(true);

    const request = mockSetOverageMenuRequest.mock.calls[0][0];
    request.resolve('stop');
    await flowPromise;

    expect(isDialogPending.current).toBe(false);
    // Verify null was set to clear the request
    expect(mockSetOverageMenuRequest).toHaveBeenCalledWith(null);
  });

  it('should clear dialog state after empty wallet menu resolves', async () => {
    vi.mocked(shouldShowEmptyWalletMenu).mockReturnValue(true);

    const flowPromise = handleCreditsFlow(makeArgs());
    expect(isDialogPending.current).toBe(true);

    const request = mockSetEmptyWalletRequest.mock.calls[0][0];
    request.resolve('stop');
    await flowPromise;

    expect(isDialogPending.current).toBe(false);
    expect(mockSetEmptyWalletRequest).toHaveBeenCalledWith(null);
  });
});
