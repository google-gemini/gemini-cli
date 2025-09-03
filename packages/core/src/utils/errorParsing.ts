/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  isProQuotaExceededError,
  isGenericQuotaExceededError,
  isApiError,
  isStructuredError,
} from './quotaErrorDetection.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../config/models.js';
import { UserTierId } from '../code_assist/types.js';
import { AuthType } from '../core/contentGenerator.js';
import { getTranslatedErrorMessage } from './i18nInterface.js';

// Free Tier message functions
const getRateLimitErrorMessageGoogleFree = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  getTranslatedErrorMessage(
    'quota.rateLimitDetected',
    `\nPossible quota limitations in place or slow response times detected. Switching to the ${fallbackModel} model for the rest of this session.`,
    { fallbackModel },
  );

const getRateLimitErrorMessageGoogleProQuotaFree = (
  currentModel: string = DEFAULT_GEMINI_MODEL,
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  getTranslatedErrorMessage(
    'quota.modelQuotaReached',
    `\nYou have reached your daily ${currentModel} quota limit. You will be switched to the ${fallbackModel} model for the rest of this session. To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist, or use /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`,
    { currentModel, fallbackModel },
  );

const getRateLimitErrorMessageGoogleGenericQuotaFree = () =>
  getTranslatedErrorMessage(
    'quota.dailyQuotaReached',
    `\nYou have reached your daily quota limit. To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist, or use /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`,
  );

// Legacy/Standard Tier message functions
const getRateLimitErrorMessageGooglePaid = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  getTranslatedErrorMessage(
    'quota.rateLimitDetectedPaid',
    `\nPossible quota limitations in place or slow response times detected. Switching to the ${fallbackModel} model for the rest of this session. We appreciate you for choosing Gemini Code Assist and the Gemini CLI.`,
    { fallbackModel },
  );

const getRateLimitErrorMessageGoogleProQuotaPaid = (
  currentModel: string = DEFAULT_GEMINI_MODEL,
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  getTranslatedErrorMessage(
    'quota.modelQuotaReachedPaid',
    `\nYou have reached your daily ${currentModel} quota limit. You will be switched to the ${fallbackModel} model for the rest of this session. We appreciate you for choosing Gemini Code Assist and the Gemini CLI. To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`,
    { currentModel, fallbackModel },
  );

const getRateLimitErrorMessageGoogleGenericQuotaPaid = (
  currentModel: string = DEFAULT_GEMINI_MODEL,
) =>
  getTranslatedErrorMessage(
    'quota.dailyQuotaReachedPaid',
    `\nYou have reached your daily quota limit. We appreciate you for choosing Gemini Code Assist and the Gemini CLI. To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`,
    { currentModel },
  );
const RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI = getTranslatedErrorMessage(
  'quota.waitAndRetryGemini',
  '\nPlease wait and try again later. To increase your limits, request a quota increase through AI Studio, or switch to another /auth method',
);
const RATE_LIMIT_ERROR_MESSAGE_VERTEX = getTranslatedErrorMessage(
  'quota.waitAndRetryVertex',
  '\nPlease wait and try again later. To increase your limits, request a quota increase through Vertex, or switch to another /auth method',
);
const getRateLimitErrorMessageDefault = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  getTranslatedErrorMessage(
    'quota.rateLimitDefault',
    `\nPossible quota limitations in place or slow response times detected. Switching to the ${fallbackModel} model for the rest of this session.`,
    { fallbackModel },
  );

function getRateLimitMessage(
  authType?: AuthType,
  error?: unknown,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): string {
  switch (authType) {
    case AuthType.LOGIN_WITH_GOOGLE: {
      // Determine if user is on a paid tier (Legacy or Standard) - default to FREE if not specified
      const isPaidTier =
        userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

      if (isProQuotaExceededError(error)) {
        return isPaidTier
          ? getRateLimitErrorMessageGoogleProQuotaPaid(
              currentModel || DEFAULT_GEMINI_MODEL,
              fallbackModel,
            )
          : getRateLimitErrorMessageGoogleProQuotaFree(
              currentModel || DEFAULT_GEMINI_MODEL,
              fallbackModel,
            );
      } else if (isGenericQuotaExceededError(error)) {
        return isPaidTier
          ? getRateLimitErrorMessageGoogleGenericQuotaPaid(
              currentModel || DEFAULT_GEMINI_MODEL,
            )
          : getRateLimitErrorMessageGoogleGenericQuotaFree();
      } else {
        return isPaidTier
          ? getRateLimitErrorMessageGooglePaid(fallbackModel)
          : getRateLimitErrorMessageGoogleFree(fallbackModel);
      }
    }
    case AuthType.USE_GEMINI:
      return RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI;
    case AuthType.USE_VERTEX_AI:
      return RATE_LIMIT_ERROR_MESSAGE_VERTEX;
    default:
      return getRateLimitErrorMessageDefault(fallbackModel);
  }
}

export function parseAndFormatApiError(
  error: unknown,
  authType?: AuthType,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): string {
  if (isStructuredError(error)) {
    let text = getTranslatedErrorMessage(
      'api.prefix',
      `[API Error: ${error.message}]`,
      { message: error.message },
    );
    if (error.status === 429) {
      text += getRateLimitMessage(
        authType,
        error,
        userTier,
        currentModel,
        fallbackModel,
      );
    }
    return text;
  }

  // The error message might be a string containing a JSON object.
  if (typeof error === 'string') {
    const jsonStart = error.indexOf('{');
    if (jsonStart === -1) {
      return getTranslatedErrorMessage('api.prefix', `[API Error: ${error}]`, {
        message: error,
      }); // Not a JSON error, return as is.
    }

    const jsonString = error.substring(jsonStart);

    try {
      const parsedError = JSON.parse(jsonString) as unknown;
      if (isApiError(parsedError)) {
        let finalMessage = parsedError.error.message;
        try {
          // See if the message is a stringified JSON with another error
          const nestedError = JSON.parse(finalMessage) as unknown;
          if (isApiError(nestedError)) {
            finalMessage = nestedError.error.message;
          }
        } catch (_e) {
          // It's not a nested JSON error, so we just use the message as is.
        }
        let text = getTranslatedErrorMessage(
          'api.prefixWithStatus',
          `[API Error: ${finalMessage} (Status: ${parsedError.error.status})]`,
          { message: finalMessage, status: parsedError.error.status },
        );
        if (parsedError.error.code === 429) {
          text += getRateLimitMessage(
            authType,
            parsedError,
            userTier,
            currentModel,
            fallbackModel,
          );
        }
        return text;
      }
    } catch (_e) {
      // Not a valid JSON, fall through and return the original message.
    }
    return getTranslatedErrorMessage('api.prefix', `[API Error: ${error}]`, {
      message: error,
    });
  }

  return getTranslatedErrorMessage(
    'api.unknownError',
    '[API Error: An unknown error occurred.]',
  );
}
