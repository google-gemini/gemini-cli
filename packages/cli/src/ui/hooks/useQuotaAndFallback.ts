/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type Config,
  type FallbackModelHandler,
  type FallbackIntent,
  type ValidationHandler,
  type ValidationIntent,
  TerminalQuotaError,
  ModelNotFoundError,
  type UserTierId,
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
  VALID_GEMINI_MODELS,
  getG1CreditBalance,
  shouldAutoUseCredits,
  shouldShowOverageMenu,
  shouldShowEmptyWalletMenu,
  type GeminiUserTier,
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
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';
import {
  type ProQuotaDialogRequest,
  type ValidationDialogRequest,
  type OverageMenuDialogRequest,
  type OverageMenuIntent,
  type EmptyWalletDialogRequest,
  type EmptyWalletIntent,
} from '../contexts/UIStateContext.js';
import type { LoadedSettings } from '../../config/settings.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  paidTier: GeminiUserTier | null | undefined;
  settings: LoadedSettings;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
  onShowAuthSelection: () => void;
}

export function useQuotaAndFallback({
  config,
  historyManager,
  userTier,
  paidTier,
  settings,
  setModelSwitchedFromQuotaError,
  onShowAuthSelection,
}: UseQuotaAndFallbackArgs) {
  const [proQuotaRequest, setProQuotaRequest] =
    useState<ProQuotaDialogRequest | null>(null);
  const [validationRequest, setValidationRequest] =
    useState<ValidationDialogRequest | null>(null);
  // G1 AI Credits dialog states
  const [overageMenuRequest, setOverageMenuRequest] =
    useState<OverageMenuDialogRequest | null>(null);
  const [emptyWalletRequest, setEmptyWalletRequest] =
    useState<EmptyWalletDialogRequest | null>(null);
  const isDialogPending = useRef(false);
  const isValidationPending = useRef(false);

  // Get the overage strategy from settings
  const overageStrategy =
    (settings.merged.billing?.overageStrategy as
      | 'ask'
      | 'always'
      | 'never'
      | undefined) ?? 'ask';

  // Set up Flash fallback handler
  useEffect(() => {
    const fallbackHandler: FallbackModelHandler = async (
      failedModel,
      fallbackModel,
      error,
    ): Promise<FallbackIntent | null> => {
      // Fallbacks are currently only handled for OAuth users.
      const contentGeneratorConfig = config.getContentGeneratorConfig();
      if (
        !contentGeneratorConfig ||
        contentGeneratorConfig.authType !== AuthType.LOGIN_WITH_GOOGLE
      ) {
        return null;
      }

      let message: string;
      let isTerminalQuotaError = false;
      let isModelNotFoundError = false;
      const usageLimitReachedModel =
        failedModel === DEFAULT_GEMINI_MODEL ||
        failedModel === PREVIEW_GEMINI_MODEL
          ? 'all Pro models'
          : failedModel;

      if (error instanceof TerminalQuotaError) {
        isTerminalQuotaError = true;

        // G1 Credits Flow: Only apply if user has a tier that supports credits
        // (paidTier?.availableCredits indicates the user is a G1 subscriber)
        if (paidTier?.availableCredits) {
          const creditBalance = getG1CreditBalance(paidTier);

          // creditBalance is null when user is not eligible for G1 credits.
          // In that case, fall through to the default ProQuotaDialog below.
          if (creditBalance == null) {
            // Not eligible for credits — skip G1 flow
          } else {
            const resetTime = error.retryDelayMs
              ? getResetTimeMessage(error.retryDelayMs)
              : undefined;

            // G1 Credits Flow: Check overageStrategy setting
            if (shouldAutoUseCredits(overageStrategy, creditBalance)) {
              // Auto-use credits: retry with credits enabled
              // Note: This will be handled by the caller with 'retry_with_credits' intent
              historyManager.addItem(
                {
                  type: MessageType.INFO,
                  text: `Usage limit reached. Automatically using AI Credits (${creditBalance} available).`,
                },
                Date.now(),
              );
              // Return special intent to retry with credits
              return 'retry_with_credits';
            }

            const showOverage = shouldShowOverageMenu(
              overageStrategy,
              creditBalance,
            );
            if (showOverage) {
              // Log overage menu shown
              logBillingEvent(
                config,
                new OverageMenuShownEvent(
                  usageLimitReachedModel,
                  creditBalance,
                  overageStrategy,
                ),
              );

              // Show overage menu dialog
              if (isDialogPending.current) {
                return 'stop';
              }
              isDialogPending.current = true;

              setModelSwitchedFromQuotaError(true);
              config.setQuotaErrorOccurred(true);

              const overageIntent = await new Promise<OverageMenuIntent>(
                (resolve) => {
                  setOverageMenuRequest({
                    failedModel: usageLimitReachedModel,
                    resetTime,
                    creditBalance,
                    resolve,
                  });
                },
              );

              // Handle the intent
              setOverageMenuRequest(null);
              isDialogPending.current = false;

              switch (overageIntent) {
                case 'use_credits':
                  // User chose to use credits
                  logBillingEvent(
                    config,
                    new OverageOptionSelectedEvent(
                      usageLimitReachedModel,
                      'use_credits',
                      creditBalance,
                    ),
                  );
                  recordOverageOptionSelected(config, {
                    selected_option: 'use_credits',
                    model: usageLimitReachedModel,
                  });
                  historyManager.addItem(
                    {
                      type: MessageType.INFO,
                      text: `Using AI Credits for this request.`,
                    },
                    Date.now(),
                  );
                  return 'retry_with_credits';
                case 'manage':
                  // User wants to manage credits
                  logBillingEvent(
                    config,
                    new OverageOptionSelectedEvent(
                      usageLimitReachedModel,
                      'manage',
                      creditBalance,
                    ),
                  );
                  recordOverageOptionSelected(config, {
                    selected_option: 'manage',
                    model: usageLimitReachedModel,
                  });
                  logBillingEvent(
                    config,
                    new CreditPurchaseClickEvent(
                      'manage',
                      usageLimitReachedModel,
                    ),
                  );
                  recordCreditPurchaseClick(config, {
                    source: 'manage',
                    model: usageLimitReachedModel,
                  });
                  try {
                    const userEmail =
                      new UserAccountManager().getCachedGoogleAccount() ?? '';
                    await openBrowserSecurely(
                      buildG1Url(
                        'activity',
                        userEmail,
                        G1_UTM_CAMPAIGNS.MANAGE_ACTIVITY,
                      ),
                    );
                  } catch (_e) {
                    // Ignore browser open errors
                  }
                  return 'stop';
                case 'switch_auth':
                  logBillingEvent(
                    config,
                    new OverageOptionSelectedEvent(
                      usageLimitReachedModel,
                      'switch_auth',
                      creditBalance,
                    ),
                  );
                  recordOverageOptionSelected(config, {
                    selected_option: 'switch_auth',
                    model: usageLimitReachedModel,
                  });
                  onShowAuthSelection();
                  return 'stop';
                case 'stop':
                default:
                  logBillingEvent(
                    config,
                    new OverageOptionSelectedEvent(
                      usageLimitReachedModel,
                      'stop',
                      creditBalance,
                    ),
                  );
                  recordOverageOptionSelected(config, {
                    selected_option: 'stop',
                    model: usageLimitReachedModel,
                  });
                  return 'stop';
              }
            }

            const showEmptyWallet = shouldShowEmptyWalletMenu(
              overageStrategy,
              creditBalance,
            );
            if (showEmptyWallet) {
              // Log empty wallet menu shown
              logBillingEvent(
                config,
                new EmptyWalletMenuShownEvent(usageLimitReachedModel),
              );

              // Show empty wallet dialog
              if (isDialogPending.current) {
                return 'stop';
              }
              isDialogPending.current = true;

              setModelSwitchedFromQuotaError(true);
              config.setQuotaErrorOccurred(true);

              const emptyWalletIntent = await new Promise<EmptyWalletIntent>(
                (resolve) => {
                  setEmptyWalletRequest({
                    failedModel: usageLimitReachedModel,
                    resetTime,
                    resolve,
                  });
                },
              );

              // Handle the intent
              setEmptyWalletRequest(null);
              isDialogPending.current = false;

              switch (emptyWalletIntent) {
                case 'get_credits':
                  // User wants to purchase credits
                  logBillingEvent(
                    config,
                    new CreditPurchaseClickEvent(
                      'empty_wallet_menu',
                      usageLimitReachedModel,
                    ),
                  );
                  recordCreditPurchaseClick(config, {
                    source: 'empty_wallet_menu',
                    model: usageLimitReachedModel,
                  });
                  try {
                    const userEmail =
                      new UserAccountManager().getCachedGoogleAccount() ?? '';
                    await openBrowserSecurely(
                      buildG1Url(
                        'credits',
                        userEmail,
                        G1_UTM_CAMPAIGNS.EMPTY_WALLET_ADD_CREDITS,
                      ),
                    );
                  } catch (_e) {
                    // Ignore browser open errors
                  }
                  return 'stop';
                case 'switch_auth':
                  onShowAuthSelection();
                  return 'stop';
                case 'stop':
                default:
                  return 'stop';
              }
            }
          } // End of else (creditBalance != null)
        } // End of if (paidTier?.availableCredits)

        // Default: Show existing ProQuotaDialog (for overageStrategy: 'never' or non-G1 users)
        const messageLines = [
          `Usage limit reached for ${usageLimitReachedModel}.`,
          error.retryDelayMs
            ? `Access resets at ${getResetTimeMessage(error.retryDelayMs)}.`
            : null,
          `/stats model for usage details`,
          `/model to switch models.`,
          `/auth to switch to API key.`,
        ].filter(Boolean);
        message = messageLines.join('\n');
      } else if (error instanceof ModelNotFoundError) {
        isModelNotFoundError = true;
        if (VALID_GEMINI_MODELS.has(failedModel)) {
          const messageLines = [
            `It seems like you don't have access to ${failedModel}.`,
            `Your admin might have disabled the access. Contact them to enable the Preview Release Channel.`,
          ];
          message = messageLines.join('\n');
        } else {
          const messageLines = [
            `Model "${failedModel}" was not found or is invalid.`,
            `/model to switch models.`,
          ];
          message = messageLines.join('\n');
        }
      } else {
        const messageLines = [
          `We are currently experiencing high demand.`,
          'We apologize and appreciate your patience.',
          '/model to switch models.',
        ];
        message = messageLines.join('\n');
      }

      setModelSwitchedFromQuotaError(true);
      config.setQuotaErrorOccurred(true);

      if (isDialogPending.current) {
        return 'stop'; // A dialog is already active, so just stop this request.
      }
      isDialogPending.current = true;

      const intent: FallbackIntent = await new Promise<FallbackIntent>(
        (resolve) => {
          setProQuotaRequest({
            failedModel,
            fallbackModel,
            resolve,
            message,
            isTerminalQuotaError,
            isModelNotFoundError,
          });
        },
      );

      return intent;
    };

    config.setFallbackModelHandler(fallbackHandler);
  }, [
    config,
    historyManager,
    userTier,
    paidTier,
    settings,
    overageStrategy,
    setModelSwitchedFromQuotaError,
    onShowAuthSelection,
  ]);

  // Set up validation handler for 403 VALIDATION_REQUIRED errors
  useEffect(() => {
    const validationHandler: ValidationHandler = async (
      validationLink,
      validationDescription,
      learnMoreUrl,
    ): Promise<ValidationIntent> => {
      if (isValidationPending.current) {
        return 'cancel'; // A validation dialog is already active
      }
      isValidationPending.current = true;

      const intent: ValidationIntent = await new Promise<ValidationIntent>(
        (resolve) => {
          // Call setValidationRequest directly - same pattern as proQuotaRequest
          setValidationRequest({
            validationLink,
            validationDescription,
            learnMoreUrl,
            resolve,
          });
        },
      );

      return intent;
    };

    config.setValidationHandler(validationHandler);
  }, [config]);

  const handleProQuotaChoice = useCallback(
    (choice: FallbackIntent) => {
      if (!proQuotaRequest) return;

      const intent: FallbackIntent = choice;
      proQuotaRequest.resolve(intent);
      setProQuotaRequest(null);
      isDialogPending.current = false; // Reset the flag here

      if (choice === 'retry_always' || choice === 'retry_once') {
        // Reset quota error flags to allow the agent loop to continue.
        setModelSwitchedFromQuotaError(false);
        config.setQuotaErrorOccurred(false);

        if (choice === 'retry_always') {
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: `Switched to fallback model ${proQuotaRequest.fallbackModel}`,
            },
            Date.now(),
          );
        }
      }
    },
    [proQuotaRequest, historyManager, config, setModelSwitchedFromQuotaError],
  );

  const handleValidationChoice = useCallback(
    (choice: ValidationIntent) => {
      // Guard against double-execution (e.g. rapid clicks) and stale requests
      if (!isValidationPending.current || !validationRequest) return;

      // Immediately clear the flag to prevent any subsequent calls from passing the guard
      isValidationPending.current = false;

      validationRequest.resolve(choice);
      setValidationRequest(null);

      if (choice === 'change_auth' || choice === 'cancel') {
        onShowAuthSelection();
      }
    },
    [validationRequest, onShowAuthSelection],
  );

  // Handler for overage menu dialog (G1 AI Credits flow)
  const handleOverageMenuChoice = useCallback(
    (choice: OverageMenuIntent) => {
      if (!overageMenuRequest) return;

      overageMenuRequest.resolve(choice);
      // State will be cleared by the effect callback after the promise resolves
    },
    [overageMenuRequest],
  );

  // Handler for empty wallet dialog (G1 AI Credits flow)
  const handleEmptyWalletChoice = useCallback(
    (choice: EmptyWalletIntent) => {
      if (!emptyWalletRequest) return;

      emptyWalletRequest.resolve(choice);
      // State will be cleared by the effect callback after the promise resolves
    },
    [emptyWalletRequest],
  );

  return {
    proQuotaRequest,
    handleProQuotaChoice,
    validationRequest,
    handleValidationChoice,
    // G1 AI Credits
    overageMenuRequest,
    handleOverageMenuChoice,
    emptyWalletRequest,
    handleEmptyWalletChoice,
  };
}

function getResetTimeMessage(delayMs: number): string {
  const resetDate = new Date(Date.now() + delayMs);

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return timeFormatter.format(resetDate);
}
