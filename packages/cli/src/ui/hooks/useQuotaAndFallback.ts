/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  type AutoFallbackStatus,
  type Config,
  type FallbackModelHandler,
  type FallbackIntent,
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
import { type ProQuotaDialogRequest } from '../contexts/UIStateContext.js';
import { type LoadedSettings, SettingScope } from '../../config/settings.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
  settings: LoadedSettings;
}

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
      autoFallbackStatus?: AutoFallbackStatus,
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
          `Learn more at https://goo.gle/enable-preview-features`,
          `To disable ${failedModel}, disable "Preview features" in /settings.`,
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

      // Handle automatic auth fallback results from core
      if (autoFallbackStatus?.status === 'success') {
        const authLabel =
          autoFallbackStatus.authType === 'gemini-api-key'
            ? 'Gemini API key'
            : 'Vertex AI';
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: `✓ Automatically switched to ${authLabel} authentication for this session.`,
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
  }, [
    config,
    historyManager,
    userTier,
    setModelSwitchedFromQuotaError,
    settings,
  ]);

  const handleProQuotaChoice = useCallback(
    async (choice: FallbackIntent | 'gemini-api-key' | 'vertex-ai') => {
      if (!proQuotaRequest) return;

      // Handle auth fallback choices
      if (choice === 'gemini-api-key' || choice === 'vertex-ai') {
        // Save the preference for future sessions
        settings.setValue(SettingScope.User, 'security.auth.autoFallback', {
          enabled: true,
          type: choice,
        });

        // Try to switch auth for this session
        const hasEnvVars =
          choice === 'gemini-api-key'
            ? Boolean(process.env['GEMINI_API_KEY'])
            : Boolean(
                process.env['GOOGLE_API_KEY'] ||
                  (process.env['GOOGLE_CLOUD_PROJECT'] &&
                    process.env['GOOGLE_CLOUD_LOCATION']),
              );

        if (hasEnvVars) {
          try {
            await config.refreshAuth(
              choice === 'gemini-api-key'
                ? AuthType.USE_GEMINI
                : AuthType.USE_VERTEX_AI,
            );
            const authLabel =
              choice === 'gemini-api-key' ? 'Gemini API key' : 'Vertex AI';
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: `✓ Switched to ${authLabel} authentication. Future sessions will also use this fallback when quota is exceeded.`,
              },
              Date.now(),
            );
          } catch (error) {
            const authLabel =
              choice === 'gemini-api-key' ? 'Gemini API key' : 'Vertex AI';
            historyManager.addItem(
              {
                type: MessageType.INFO,
                text: `Failed to switch to ${authLabel}: ${error instanceof Error ? error.message : 'Unknown error'}. Setting saved for future sessions.`,
              },
              Date.now(),
            );
          }
        } else {
          const envVarHint =
            choice === 'gemini-api-key'
              ? 'GEMINI_API_KEY'
              : 'GOOGLE_API_KEY or (GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION)';
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: `Auto-fallback enabled but environment variables missing. Set ${envVarHint} to use this feature.`,
            },
            Date.now(),
          );
        }

        proQuotaRequest.resolve('retry_once');
        setProQuotaRequest(null);
        isDialogPending.current = false;
        return;
      }

      const intent: FallbackIntent = choice;
      proQuotaRequest.resolve(intent);
      setProQuotaRequest(null);
      isDialogPending.current = false;

      if (choice === 'retry_always') {
        // Set the model to the fallback model for the current session.
        // This ensures the Footer updates and future turns use this model.
        // The change is not persisted, so the original model is restored on restart.
        config.activateFallbackMode(proQuotaRequest.fallbackModel);
        historyManager.addItem(
          {
            type: MessageType.INFO,
            text: `Switched to fallback model ${proQuotaRequest.fallbackModel}`,
          },
          Date.now(),
        );
      }
    },
    [proQuotaRequest, historyManager, config, settings],
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
