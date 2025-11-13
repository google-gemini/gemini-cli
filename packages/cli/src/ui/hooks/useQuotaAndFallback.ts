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

      // For non-Terminal quota errors, show dialog
      if (isDialogPending.current) {
        return 'stop';
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
    async (
      choice: 'retry_later' | 'retry' | 'gemini-api-key' | 'vertex-ai',
    ) => {
      if (!proQuotaRequest) return;

      // Handle auto-fallback configuration choices
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
      }
      // Handle main's retry_later option
      else if (choice === 'retry_later') {
        proQuotaRequest.resolve('retry_later');
      }
      // Handle main's retry option
      else {
        proQuotaRequest.resolve('retry');
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: 'Switched to fallback model. Tip: Press Ctrl+P (or Up Arrow) to recall your previous prompt and submit it again if you wish.',
          },
          Date.now(),
        );
      }

      setProQuotaRequest(null);
      isDialogPending.current = false; // Reset the flag here
    },
    [proQuotaRequest, historyManager, settings, config],
  );

  return {
    proQuotaRequest,
    handleProQuotaChoice,
  };
}
