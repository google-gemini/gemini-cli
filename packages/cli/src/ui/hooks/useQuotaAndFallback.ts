/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type Config,
  type FallbackHandler,
  type FallbackIntent,
  isGenericQuotaExceededError,
  isProQuotaExceededError,
  UserTierId,
} from '@google/gemini-cli-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import { AuthState, MessageType } from '../types.js';
import { type ProQuotaDialogRequest } from '../contexts/UIStateContext.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  setAuthState: (state: AuthState) => void;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
}

export function useQuotaAndFallback({
  config,
  historyManager,
  userTier,
  setAuthState,
  setModelSwitchedFromQuotaError,
}: UseQuotaAndFallbackArgs) {
  const [proQuotaRequest, setProQuotaRequest] =
    useState<ProQuotaDialogRequest | null>(null);
  const isDialogPending = useRef(false);

  // Set up Flash fallback handler
  useEffect(() => {
    const fallbackHandler: FallbackHandler = async (
      failedModel,
      fallbackModel,
      error,
    ): Promise<FallbackIntent | null> => {
      if (config.isInFallbackMode()) {
        return null;
      }

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

      let message: string;

      if (error && isProQuotaExceededError(error)) {
        // Pro Quota specific messages (Interactive)
        if (isPaidTier) {
          message = `⚡ You have reached your daily ${failedModel} quota limit.
⚡ You can choose to authenticate with a paid API key or continue with the fallback model.
⚡ To continue accessing the ${failedModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
        } else {
          message = `⚡ You have reached your daily ${failedModel} quota limit.
⚡ You can choose to authenticate with a paid API key or continue with the fallback model.
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
        }
      } else if (error && isGenericQuotaExceededError(error)) {
        // Generic Quota (Automatic fallback)
        const actionMessage = `⚡ You have reached your daily quota limit.\n⚡ Automatically switching from ${failedModel} to ${fallbackModel} for the remainder of this session.`;

        if (isPaidTier) {
          message = `${actionMessage}
⚡ To continue accessing the ${failedModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
        } else {
          message = `${actionMessage}
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
        }
      } else {
        // Consecutive 429s or other errors (Automatic fallback)
        const actionMessage = `⚡ Automatically switching from ${failedModel} to ${fallbackModel} for faster responses for the remainder of this session.`;

        if (isPaidTier) {
          message = `${actionMessage}
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${failedModel} quota limit
⚡ To continue accessing the ${failedModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
        } else {
          message = `${actionMessage}
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${failedModel} quota limit
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
        }
      }

      // Add message to UI history
      historyManager.addItem(
        {
          type: MessageType.INFO,
          text: message,
        },
        Date.now(),
      );

      setModelSwitchedFromQuotaError(true);
      config.setQuotaErrorOccurred(true);

      // Interactive Fallback for Pro quota
      if (error && isProQuotaExceededError(error)) {
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
      }

      return 'stop';
    };

    config.setFallbackHandler(fallbackHandler);
  }, [config, historyManager, userTier, setModelSwitchedFromQuotaError]);

  const handleProQuotaChoice = useCallback(
    (choice: 'auth' | 'continue') => {
      if (!proQuotaRequest) return;

      const intent: FallbackIntent = choice === 'auth' ? 'auth' : 'retry';
      proQuotaRequest.resolve(intent);
      setProQuotaRequest(null);
      isDialogPending.current = false; // Reset the flag here

      if (choice === 'auth') {
        setAuthState(AuthState.Updating);
      } else {
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: 'Switched to fallback model. Tip: Press Ctrl+P (or Up Arrow) to recall your previous prompt and submit it again if you wish.',
          },
          Date.now(),
        );
      }
    },
    [proQuotaRequest, setAuthState, historyManager],
  );

  return {
    proQuotaRequest,
    handleProQuotaChoice,
  };
}
