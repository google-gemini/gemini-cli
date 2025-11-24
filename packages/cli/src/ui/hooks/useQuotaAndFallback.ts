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
} from '@google/gemini-cli-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';
import { type ProQuotaDialogRequest } from '../contexts/UIStateContext.js';
import { type LoadedSettings, SettingScope } from '../../config/settings.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
  settings: LoadedSettings;
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
      if (error instanceof TerminalQuotaError) {
        isTerminalQuotaError = true;
        // Common part of the message for both tiers
        const messageLines = [
          `Usage limit reached for ${failedModel}.`,
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

      // Handle automatic auth fallback
      if (autoFallbackStatus?.status === 'success') {
        const authLabel =
          autoFallbackStatus.authType === 'gemini-api-key'
            ? 'Gemini API key'
            : 'Vertex AI';
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: `✓ Automatically switched to ${authLabel} authentication for this session. Future sessions will also use this fallback when quota is exceeded.`,
          },
          Date.now(),
        );
        return 'retry_once'; // Retry immediately with the new auth
      } else if (autoFallbackStatus?.status === 'missing-env-vars') {
        const authLabel =
          autoFallbackStatus.authType === 'gemini-api-key'
            ? 'Gemini API key'
            : 'Vertex AI';
        const envVarHint =
          autoFallbackStatus.authType === 'gemini-api-key'
            ? 'GEMINI_API_KEY'
            : 'GOOGLE_API_KEY or (GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION)';
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: `Auto-fallback to ${authLabel} is enabled but environment variables are missing. Set ${envVarHint} to enable automatic fallback.`,
          },
          Date.now(),
        );
      }

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
    async (
      choice:
        | 'retry_later'
        | 'retry_once'
        | 'retry_always'
        | 'upgrade'
        | 'gemini-api-key'
        | 'vertex-ai',
    ) => {
      if (!proQuotaRequest) return;

      // Handle auth fallback choices
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

        proQuotaRequest.resolve('retry_once' as FallbackIntent);
      }
      // Keep main's existing logic for model choices
      else {
        // At this point, choice is guaranteed to be a FallbackIntent
        const intent = choice as FallbackIntent;
        proQuotaRequest.resolve(intent);

        if (choice === 'retry_always') {
          // If we were recovering from a Preview Model failure, show a specific message.
          if (proQuotaRequest.failedModel === PREVIEW_GEMINI_MODEL) {
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: `Switched to fallback model ${proQuotaRequest.fallbackModel}. ${!proQuotaRequest.isModelNotFoundError ? `We will periodically check if ${PREVIEW_GEMINI_MODEL} is available again.` : ''}`,
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
      }

      setProQuotaRequest(null);
      isDialogPending.current = false;
    },
    [proQuotaRequest, historyManager, settings, config],
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
