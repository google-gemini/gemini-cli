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
  VALID_GEMINI_MODELS,
  isProModel,
  isOverageEligibleModel,
  getDisplayString,
  type GeminiUserTier,
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
import { handleCreditsFlow } from './creditsFlowHandler.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  paidTier: GeminiUserTier | null | undefined;
  settings: LoadedSettings;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
  onShowAuthSelection: () => void;
  errorVerbosity?: 'low' | 'full';
}

export function useQuotaAndFallback({
  config,
  historyManager,
  userTier,
  paidTier,
  settings,
  setModelSwitchedFromQuotaError,
  onShowAuthSelection,
  errorVerbosity = 'full',
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

  // Initial overage strategy from settings; runtime value read from config at call time.
  const initialOverageStrategy =
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
      const contentGeneratorConfig = config.getContentGeneratorConfig();

      let message: string;
      let isTerminalQuotaError = false;
      let isModelNotFoundError = false;
      const usageLimitReachedModel = isProModel(failedModel)
        ? 'all Pro models'
        : failedModel;

      if (error instanceof TerminalQuotaError) {
        isTerminalQuotaError = true;

        const isInsufficientCredits = error.isInsufficientCredits;

        // G1 Credits Flow: Only apply if user has a tier that supports credits
        // (paidTier?.availableCredits indicates the user is a G1 subscriber)
        // Skip if the error explicitly says they have insufficient credits (e.g. they
        // just exhausted them or zero balance cache is delayed).
        if (
          !isInsufficientCredits &&
          paidTier?.availableCredits &&
          isOverageEligibleModel(failedModel)
        ) {
          const resetTime = error.retryDelayMs
            ? getResetTimeMessage(error.retryDelayMs)
            : undefined;

          const overageStrategy =
            config.getBillingSettings().overageStrategy ??
            initialOverageStrategy;

          const creditsResult = await handleCreditsFlow({
            config,
            paidTier,
            overageStrategy,
            failedModel,
            fallbackModel,
            usageLimitReachedModel,
            resetTime,
            historyManager,
            setModelSwitchedFromQuotaError,
            isDialogPending,
            setOverageMenuRequest,
            setEmptyWalletRequest,
          });
          if (creditsResult) return creditsResult;
        }

        // Default: Show existing ProQuotaDialog (for overageStrategy: 'never' or non-G1 users)
        const messageLines = [
          `Usage limit reached for ${usageLimitReachedModel}.`,
          error.retryDelayMs
            ? `Access resets at ${getResetTimeMessage(error.retryDelayMs)}.`
            : null,
          `/stats model for usage details`,
          `/model to switch models.`,
          contentGeneratorConfig?.authType === AuthType.LOGIN_WITH_GOOGLE
            ? `/auth to switch to API key.`
            : null,
        ].filter(Boolean);
        message = messageLines.join('\n');
      } else if (error instanceof ModelNotFoundError) {
        isModelNotFoundError = true;
        if (VALID_GEMINI_MODELS.has(failedModel)) {
          const messageLines = [
            `It seems like you don't have access to ${getDisplayString(failedModel)}.`,
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

      // In low verbosity mode, auto-retry transient capacity failures
      // without interrupting with a dialog.
      if (
        errorVerbosity === 'low' &&
        !isTerminalQuotaError &&
        !isModelNotFoundError
      ) {
        return 'retry_once';
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
            authType: contentGeneratorConfig?.authType,
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
    initialOverageStrategy,
    setModelSwitchedFromQuotaError,
    onShowAuthSelection,
    errorVerbosity,
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
