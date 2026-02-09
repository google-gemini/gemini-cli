/**
 * @license
 * Copyright 2025 Google LLC
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
} from '@google/gemini-cli-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';
import {
  type ProQuotaDialogRequest,
  type ValidationDialogRequest,
} from '../contexts/UIStateContext.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
  onShowAuthSelection: () => void;
}

export function useQuotaAndFallback({
  config,
  historyManager,
  userTier,
  setModelSwitchedFromQuotaError,
  onShowAuthSelection,
}: UseQuotaAndFallbackArgs) {
  const [proQuotaRequest, setProQuotaRequest] =
    useState<ProQuotaDialogRequest | null>(null);
  const [validationRequest, setValidationRequest] =
    useState<ValidationDialogRequest | null>(null);
  const isDialogPending = useRef(false);
  const isValidationPending = useRef(false);

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
        // Common part of the message for both tiers
        const messageLines = [
          `Usage limit reached for ${usageLimitReachedModel}.`,
          error.retryDelayMs ? getResetTimeMessage(error.retryDelayMs) : null,
          `/stats for usage details`,
          `/model to switch models.`,
          `/auth to switch to API key.`,
        ].filter(Boolean);
        message = messageLines.join('\n');
      } else if (
        error instanceof ModelNotFoundError &&
        VALID_GEMINI_MODELS.has(failedModel)
      ) {
        isModelNotFoundError = true;
        const messageLines = [
          `It seems like you don't have access to ${failedModel}.`,
          `Your admin might have disabled the access. Contact them to enable the Preview Release Channel.`,
        ];
        message = messageLines.join('\n');
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
  }, [config, historyManager, userTier, setModelSwitchedFromQuotaError]);

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

  return {
    proQuotaRequest,
    handleProQuotaChoice,
    validationRequest,
    handleValidationChoice,
  };
}

function getResetTimeMessage(delayMs: number): string {
  const resetDate = new Date(Date.now() + delayMs);

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return `Access resets at ${timeFormatter.format(resetDate)}.`;
}
