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
  UserTierId,
  DEFAULT_GEMINI_FLASH_MODEL,
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

      // Use actual user tier if available; otherwise, default to FREE tier behavior (safe default)
      const isPaidTier =
        userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

      const isFallbackModel = failedModel === DEFAULT_GEMINI_FLASH_MODEL;
      let message: string;

      if (error instanceof TerminalQuotaError) {
        // Common part of the message for both tiers
        const messageLines = [
          `⚡ You have reached your daily ${failedModel} quota limit.`,
          `⚡ You can choose to authenticate with a paid API key${
            isFallbackModel ? '.' : ' or continue with the fallback model.'
          }`,
        ];

        // Tier-specific part
        if (isPaidTier) {
          messageLines.push(
            `⚡ Increase your limits by using a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key`,
            `⚡ You can switch authentication methods by typing /auth`,
          );
        } else {
          messageLines.push(
            `⚡ Increase your limits by `,
            `⚡ - signing up for a plan with higher limits at https://goo.gle/set-up-gemini-code-assist`,
            `⚡ - or using a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key`,
            `⚡ You can switch authentication methods by typing /auth`,
          );
        }
        message = messageLines.join('\n');
      } else {
        // Capacity error
        message = [
          `🚦Pardon Our Congestion! It looks like ${failedModel} is very popular at the moment.`,
          `Please retry again later.`,
        ].join('\n');
      }

      // Add message to UI history
      historyManager.addItem(
        {
          type: MessageType.INFO,
          text: message,
        },
        Date.now(),
      );

      if (isFallbackModel) {
        return 'stop';
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

      if (choice === 'retry') {
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: 'Switched to fallback model. Tip: Press Ctrl+P (or Up Arrow) to recall your previous prompt and submit it again if you wish.',
          },
          Date.now(),
        );
      }
    },
    [proQuotaRequest, historyManager],
  );

  return {
    proQuotaRequest,
    handleProQuotaChoice,
  };
}
