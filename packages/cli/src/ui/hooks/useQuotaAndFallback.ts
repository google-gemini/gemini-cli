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
  TerminalQuotaError,
  ModelNotFoundError,
  type UserTierId,
  PREVIEW_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
} from '@google/gemini-cli-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';
import { type ProQuotaDialogRequest } from '../contexts/UIStateContext.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
}

export function useQuotaAndFallback({
  config,
  historyManager,
  userTier,
  setModelSwitchedFromQuotaError,
}: UseQuotaAndFallbackArgs) {
  const [proQuotaRequest, setProQuotaRequest] =
    useState<ProQuotaDialogRequest | null>(null);
  const isDialogPending = useRef(false);

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
          `/auth to switch to API key.`,
        ].filter(Boolean);
        message = messageLines.join('\n');
      } else if (error instanceof ModelNotFoundError) {
        isModelNotFoundError = true;
        const messageLines = [
          `It seems like you don't have access to Gemini 3.`,
          `Learn more at https://goo.gle/enable-preview-features`,
          `To disable Gemini 3, disable "Preview features" in /settings.`,
        ];
        message = messageLines.join('\n');
      } else {
        message = `${failedModel} is currently experiencing high demand. We apologize and appreciate your patience.`;
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

  const handleProQuotaChoice = useCallback(
    (choice: FallbackIntent) => {
      if (!proQuotaRequest) return;

      const intent: FallbackIntent = choice;
      proQuotaRequest.resolve(intent);
      setProQuotaRequest(null);
      isDialogPending.current = false; // Reset the flag here

      if (choice === 'retry_always') {
        // If we were recovering from a Preview Model failure, show a specific message.
        if (proQuotaRequest.failedModel === PREVIEW_GEMINI_MODEL) {
          const showPeriodicalCheckMessage =
            !proQuotaRequest.isModelNotFoundError &&
            proQuotaRequest.fallbackModel === DEFAULT_GEMINI_MODEL;
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: `Switched to fallback model ${proQuotaRequest.fallbackModel}. ${showPeriodicalCheckMessage ? `We will periodically check if ${PREVIEW_GEMINI_MODEL} is available again.` : ''}`,
            },
            Date.now(),
          );
        } else {
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: 'Switched to fallback model.',
            },
            Date.now(),
          );
        }
      }
    },
    [proQuotaRequest, historyManager],
  );

  return {
    proQuotaRequest,
    handleProQuotaChoice,
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
