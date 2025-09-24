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

// Common strings and URL constants
const AI_STUDIO_API_KEY_URL = 'https://aistudio.google.com/apikey';
const GEMINI_CODE_ASSIST_UPGRADE_URL =
  'https://goo.gle/set-up-gemini-code-assist';
const APPRECIATION_NOTE =
  'We appreciate you for choosing Gemini Code Assist and the Gemini CLI.';
const DEFAULT_FALLBACK_PREFIX =
  'Possible quota limitations in place or slow response times detected.';

const RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI =
  'Please wait and try again later. To increase your limits, request a quota increase through AI Studio, or switch to another /auth method';
const RATE_LIMIT_ERROR_MESSAGE_VERTEX =
  'Please wait and try again later. To increase your limits, request a quota increase through Vertex, or switch to another /auth method';

// Quota classification for clearer control flow
enum QuotaKind {
  NONE = 'none',
  GENERIC = 'generic',
  PRO = 'pro',
}

function classifyQuota(error: unknown): QuotaKind {
  if (isProQuotaExceededError(error)) return QuotaKind.PRO;
  if (isGenericQuotaExceededError(error)) return QuotaKind.GENERIC;
  return QuotaKind.NONE;
}

function isPaidUserTier(userTier?: UserTierId): boolean {
  return userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;
}

// Builds the Google Login rate limit message (no leading newline)
type FormatGoogleLoginRateLimitMessageOptions = {
  quota: QuotaKind;
  isPaidTier: boolean;
  currentModel?: string;
  fallbackModel?: string;
};

function formatGoogleLoginRateLimitMessage({
  quota,
  isPaidTier,
  currentModel = DEFAULT_GEMINI_MODEL,
  fallbackModel = DEFAULT_GEMINI_FLASH_MODEL,
}: FormatGoogleLoginRateLimitMessageOptions): string {
  let message: string;

  switch (quota) {
    case QuotaKind.PRO:
      message = `You have reached your daily ${currentModel} quota limit. You will be switched to the ${fallbackModel} model for the rest of this session.`;
      break;
    case QuotaKind.GENERIC:
      message = 'You have reached your daily quota limit.';
      break;
    case QuotaKind.NONE:
    default:
      message = `${DEFAULT_FALLBACK_PREFIX} Switching to the ${fallbackModel} model for the rest of this session.`;
      break;
  }

  if (isPaidTier) {
    message += ` ${APPRECIATION_NOTE}`;
    if (quota === QuotaKind.PRO || quota === QuotaKind.GENERIC) {
      message += ` To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at ${AI_STUDIO_API_KEY_URL}`;
    }
  } else {
    if (quota === QuotaKind.PRO || quota === QuotaKind.GENERIC) {
      message += ` To increase your limits, upgrade to get higher limits at ${GEMINI_CODE_ASSIST_UPGRADE_URL}, or use /auth to switch to using a paid API key from AI Studio at ${AI_STUDIO_API_KEY_URL}`;
    }
  }

  return message;
}

function getRateLimitMessage(
  authType?: AuthType,
  error?: unknown,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): string {
  const sanitizedCurrent = currentModel || DEFAULT_GEMINI_MODEL;
  const sanitizedFallback = fallbackModel || DEFAULT_GEMINI_FLASH_MODEL;

  switch (authType) {
    case AuthType.LOGIN_WITH_GOOGLE: {
      const quota = classifyQuota(error);
      const isPaidTier = isPaidUserTier(userTier);
      return (
        '\n' +
        formatGoogleLoginRateLimitMessage({
          quota,
          isPaidTier,
          currentModel: sanitizedCurrent,
          fallbackModel: sanitizedFallback,
        })
      );
    }
    case AuthType.USE_GEMINI:
      return '\n' + RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI;
    case AuthType.USE_VERTEX_AI:
      return '\n' + RATE_LIMIT_ERROR_MESSAGE_VERTEX;
    default:
      return `\n${DEFAULT_FALLBACK_PREFIX} Switching to the ${sanitizedFallback} model for the rest of this session.`;
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
    let text = `[API Error: ${error.message}]`;
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
      return `[API Error: ${error}]`; // Not a JSON error, return as is.
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
        let text = `[API Error: ${finalMessage} (Status: ${parsedError.error.status})]`;
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
    return `[API Error: ${error}]`;
  }

  return '[API Error: An unknown error occurred.]';
}
