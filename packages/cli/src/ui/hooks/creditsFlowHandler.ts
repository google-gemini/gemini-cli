/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Config,
  type FallbackIntent,
  type GeminiUserTier,
  type OverageOption,
  getG1CreditBalance,
  shouldAutoUseCredits,
  shouldShowOverageMenu,
  shouldShowEmptyWalletMenu,
  openBrowserSecurely,
  logBillingEvent,
  OverageMenuShownEvent,
  OverageOptionSelectedEvent,
  EmptyWalletMenuShownEvent,
  CreditPurchaseClickEvent,
  buildG1Url,
  G1_UTM_CAMPAIGNS,
  UserAccountManager,
  recordOverageOptionSelected,
  recordCreditPurchaseClick,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import type {
  OverageMenuIntent,
  EmptyWalletIntent,
  EmptyWalletDialogRequest,
} from '../contexts/UIStateContext.js';

interface CreditsFlowArgs {
  config: Config;
  paidTier: GeminiUserTier;
  overageStrategy: 'ask' | 'always' | 'never';
  failedModel: string;
  fallbackModel: string;
  usageLimitReachedModel: string;
  resetTime: string | undefined;
  historyManager: UseHistoryManagerReturn;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
  isDialogPending: React.MutableRefObject<boolean>;
  setOverageMenuRequest: (
    req: {
      failedModel: string;
      fallbackModel: string;
      resetTime: string | undefined;
      creditBalance: number;
      resolve: (intent: OverageMenuIntent) => void;
    } | null,
  ) => void;
  setEmptyWalletRequest: (req: EmptyWalletDialogRequest | null) => void;
}

/**
 * Handles the G1 AI Credits flow when a quota error occurs.
 * Returns a FallbackIntent if the credits flow handled the error,
 * or null to fall through to the default ProQuotaDialog.
 */
export async function handleCreditsFlow(
  args: CreditsFlowArgs,
): Promise<FallbackIntent | null> {
  const creditBalance = getG1CreditBalance(args.paidTier);

  // creditBalance is null when user is not eligible for G1 credits.
  if (creditBalance == null) {
    return null;
  }

  const { overageStrategy } = args;

  // If credits are already auto-enabled (strategy='always'), the request
  // that just failed already included enabledCreditTypes — credits didn't
  // help. Fall through to ProQuotaDialog which offers the Flash downgrade.
  if (shouldAutoUseCredits(overageStrategy, creditBalance)) {
    return null;
  }

  // Show overage menu when strategy is 'ask' and credits > 0
  if (shouldShowOverageMenu(overageStrategy, creditBalance)) {
    return handleOverageMenu(args, creditBalance);
  }

  // Show empty wallet when credits === 0 and strategy isn't 'never'
  if (shouldShowEmptyWalletMenu(overageStrategy, creditBalance)) {
    return handleEmptyWalletMenu(args);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Overage menu flow
// ---------------------------------------------------------------------------

async function handleOverageMenu(
  args: CreditsFlowArgs,
  creditBalance: number,
): Promise<FallbackIntent> {
  const {
    config,
    fallbackModel,
    usageLimitReachedModel,
    overageStrategy,
    resetTime,
    isDialogPending,
    setOverageMenuRequest,
    setModelSwitchedFromQuotaError,
    historyManager,
  } = args;

  logBillingEvent(
    config,
    new OverageMenuShownEvent(
      usageLimitReachedModel,
      creditBalance,
      overageStrategy,
    ),
  );

  if (isDialogPending.current) {
    return 'stop';
  }
  isDialogPending.current = true;

  setModelSwitchedFromQuotaError(true);
  config.setQuotaErrorOccurred(true);

  const overageIntent = await new Promise<OverageMenuIntent>((resolve) => {
    setOverageMenuRequest({
      failedModel: usageLimitReachedModel,
      fallbackModel,
      resetTime,
      creditBalance,
      resolve,
    });
  });

  setOverageMenuRequest(null);
  isDialogPending.current = false;

  logOverageOptionSelected(
    config,
    usageLimitReachedModel,
    overageIntent,
    creditBalance,
  );

  switch (overageIntent) {
    case 'use_credits':
      setModelSwitchedFromQuotaError(false);
      config.setQuotaErrorOccurred(false);
      config.setOverageStrategy('always');
      historyManager.addItem(
        {
          type: MessageType.INFO,
          text: `Using AI Credits for this request.`,
        },
        Date.now(),
      );
      return 'retry_with_credits';

    case 'use_fallback':
      return 'retry_always';

    case 'manage':
      logCreditPurchaseClick(config, 'manage', usageLimitReachedModel);
      await openG1Url('activity', G1_UTM_CAMPAIGNS.MANAGE_ACTIVITY);
      return 'stop';

    case 'stop':
    default:
      return 'stop';
  }
}

// ---------------------------------------------------------------------------
// Empty wallet flow
// ---------------------------------------------------------------------------

async function handleEmptyWalletMenu(
  args: CreditsFlowArgs,
): Promise<FallbackIntent> {
  const {
    config,
    fallbackModel,
    usageLimitReachedModel,
    resetTime,
    isDialogPending,
    setEmptyWalletRequest,
    setModelSwitchedFromQuotaError,
  } = args;

  logBillingEvent(
    config,
    new EmptyWalletMenuShownEvent(usageLimitReachedModel),
  );

  if (isDialogPending.current) {
    return 'stop';
  }
  isDialogPending.current = true;

  setModelSwitchedFromQuotaError(true);
  config.setQuotaErrorOccurred(true);

  const emptyWalletIntent = await new Promise<EmptyWalletIntent>((resolve) => {
    setEmptyWalletRequest({
      failedModel: usageLimitReachedModel,
      fallbackModel,
      resetTime,
      onGetCredits: () => {
        logCreditPurchaseClick(
          config,
          'empty_wallet_menu',
          usageLimitReachedModel,
        );
        void openG1Url('credits', G1_UTM_CAMPAIGNS.EMPTY_WALLET_ADD_CREDITS);
      },
      resolve,
    });
  });

  setEmptyWalletRequest(null);
  isDialogPending.current = false;

  switch (emptyWalletIntent) {
    case 'get_credits':
      args.historyManager.addItem(
        {
          type: MessageType.INFO,
          text: 'Newly purchased AI credits may take a few minutes to update. Run /stats to check your balance.',
        },
        Date.now(),
      );
      return 'stop';

    case 'use_fallback':
      return 'retry_always';

    case 'stop':
    default:
      return 'stop';
  }
}

// ---------------------------------------------------------------------------
// Telemetry helpers
// ---------------------------------------------------------------------------

function logOverageOptionSelected(
  config: Config,
  model: string,
  option: OverageOption,
  creditBalance: number,
): void {
  logBillingEvent(
    config,
    new OverageOptionSelectedEvent(model, option, creditBalance),
  );
  recordOverageOptionSelected(config, {
    selected_option: option,
    model,
  });
}

function logCreditPurchaseClick(
  config: Config,
  source: 'overage_menu' | 'empty_wallet_menu' | 'manage',
  model: string,
): void {
  logBillingEvent(config, new CreditPurchaseClickEvent(source, model));
  recordCreditPurchaseClick(config, { source, model });
}

async function openG1Url(
  path: 'activity' | 'credits',
  campaign: string,
): Promise<void> {
  try {
    const userEmail = new UserAccountManager().getCachedGoogleAccount() ?? '';
    await openBrowserSecurely(buildG1Url(path, userEmail, campaign));
  } catch {
    // Ignore browser open errors
  }
}
