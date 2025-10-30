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
  RetryableQuotaError,
} from '@google/gemini-cli-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import { AuthState, MessageType } from '../types.js';
import { type ProQuotaDialogRequest } from '../contexts/UIStateContext.js';
import { SettingScope } from '../../config/settings.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  setAuthState: (state: AuthState) => void;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
  settings: {
    setValue: (scope: SettingScope, key: string, value: unknown) => void;
  };
}

type AutoFallbackType = 'gemini-api-key' | 'vertex-ai';

const AUTO_FALLBACK_CONFIG: Record<
  AutoFallbackType,
  {
    settingValue: { enabled: true; type: AutoFallbackType };
    refreshAuthType: AuthType;
    hasEnvVars: () => boolean;
    successMessage: string;
    getFailureMessage: (error: unknown) => string;
    missingEnvMessage: string;
  }
> = {
  'gemini-api-key': {
    settingValue: { enabled: true, type: 'gemini-api-key' },
    refreshAuthType: AuthType.USE_GEMINI,
    hasEnvVars: () => Boolean(process.env['GEMINI_API_KEY']),
    successMessage:
      '✓ Switched to Gemini API key authentication. This session will now use your API key, and future sessions will automatically fallback when quota is exceeded.',
    getFailureMessage: (error) =>
      `Failed to switch to Gemini API key: ${
        error instanceof Error ? error.message : String(error)
      }. Setting saved for future sessions.`,
    missingEnvMessage:
      'Enabled Gemini API key fallback for future sessions. Set GEMINI_API_KEY environment variable to use API key authentication.',
  },
  'vertex-ai': {
    settingValue: { enabled: true, type: 'vertex-ai' },
    refreshAuthType: AuthType.USE_VERTEX_AI,
    hasEnvVars: () =>
      Boolean(
        process.env['GOOGLE_API_KEY'] ||
          (process.env['GOOGLE_CLOUD_PROJECT'] &&
            process.env['GOOGLE_CLOUD_LOCATION']),
      ),
    successMessage:
      '✓ Switched to Vertex AI authentication. This session will now use Vertex AI, and future sessions will automatically fallback when quota is exceeded.',
    getFailureMessage: (error) =>
      `Failed to switch to Vertex AI: ${
        error instanceof Error ? error.message : String(error)
      }. Setting saved for future sessions.`,
    missingEnvMessage:
      'Enabled Vertex AI fallback for future sessions. Set GOOGLE_API_KEY or (GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION) environment variables to use Vertex AI authentication.',
  },
};

export function useQuotaAndFallback({
  config,
  historyManager,
  userTier,
  setAuthState,
  setModelSwitchedFromQuotaError,
  settings,
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
      autoFallbackStatus,
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

      if (error instanceof TerminalQuotaError) {
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
      } else if (error instanceof RetryableQuotaError) {
        // Short term quota retries exhausted (Automatic fallback)
        const actionMessage = `⚡ Your requests are being throttled right now due to server being at capacity for ${failedModel}.\n⚡ Automatically switching from ${failedModel} to ${fallbackModel} for the remainder of this session.`;

        if (isPaidTier) {
          message = `${actionMessage}
⚡ To continue accessing the ${failedModel} model, retry your request after some time or consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
        } else {
          message = `${actionMessage}
⚡ Retry your requests after some time. Otherwise consider upgrading to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ You can switch authentication methods by typing /auth`;
        }
      } else {
        // Other errors (Automatic fallback)
        const actionMessage = `⚡ Automatically switching from ${failedModel} to ${fallbackModel} for faster responses for the remainder of this session.`;

        if (isPaidTier) {
          message = `${actionMessage}
⚡ Your requests are being throttled temporarily due to server being at capacity for ${failedModel} or there is a service outage.
⚡ To continue accessing the ${failedModel} model, you can retry your request after some time or consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
        } else {
          message = `${actionMessage}
⚡ Your requests are being throttled temporarily due to server being at capacity for ${failedModel} or there is a service outage.
⚡ To avoid being throttled, you can retry your request after some time or upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
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

      // Handle auto-fallback results from core
      if (autoFallbackStatus?.status === 'success') {
        // Core successfully switched auth - show success message
        const authTypeName =
          autoFallbackStatus.authType === 'gemini-api-key'
            ? 'Gemini API key'
            : 'Vertex AI';
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: `✓ Automatically switched to ${authTypeName} authentication due to quota limits. Retrying your request...`,
          },
          Date.now(),
        );
        return 'retry';
      }

      if (autoFallbackStatus?.status === 'missing-env-vars') {
        // Auto-fallback enabled but env vars missing
        const envVarName =
          autoFallbackStatus.authType === 'gemini-api-key'
            ? 'GEMINI_API_KEY'
            : 'GOOGLE_API_KEY or (GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION)';
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: `Auto fallback is enabled but required environment variables are not set. Set ${envVarName} to use automatic fallback.`,
          },
          Date.now(),
        );
        return 'stop';
      }

      // Interactive Fallback for Pro quota (no auto-fallback or not attempted)
      if (error instanceof TerminalQuotaError) {
        // Auto fallback not enabled - show interactive dialog
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

    config.setFallbackModelHandler(fallbackHandler);
  }, [config, historyManager, userTier, setModelSwitchedFromQuotaError]);

  const handleProQuotaChoice = useCallback(
    async (choice: 'auth' | 'continue' | AutoFallbackType) => {
      if (!proQuotaRequest) return;

      if (choice === 'gemini-api-key' || choice === 'vertex-ai') {
        const choiceConfig = AUTO_FALLBACK_CONFIG[choice];

        // Set auto fallback preference
        await settings.setValue(
          SettingScope.User,
          'security.auth.autoFallback',
          choiceConfig.settingValue,
        );

        if (choiceConfig.hasEnvVars()) {
          try {
            await config.refreshAuth(choiceConfig.refreshAuthType);
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: choiceConfig.successMessage,
              },
              Date.now(),
            );
          } catch (error) {
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: choiceConfig.getFailureMessage(error),
              },
              Date.now(),
            );
          }
        } else {
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: choiceConfig.missingEnvMessage,
            },
            Date.now(),
          );
        }

        proQuotaRequest.resolve('retry');
      } else {
        const intent: FallbackIntent = choice === 'auth' ? 'auth' : 'retry';
        proQuotaRequest.resolve(intent);

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
      }

      setProQuotaRequest(null);
      isDialogPending.current = false; // Reset the flag here
    },
    [proQuotaRequest, setAuthState, historyManager, settings, config],
  );

  return {
    proQuotaRequest,
    handleProQuotaChoice,
  };
}
