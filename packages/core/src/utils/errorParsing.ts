/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isApiError, isStructuredError } from './quotaErrorDetection.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { UserTierId } from '../code_assist/types.js';
import { AuthType } from '../core/contentGenerator.js';

const RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI =
  '\nPlease wait and try again later. To increase your limits, request a quota increase through AI Studio, or switch to another /auth method';
const RATE_LIMIT_ERROR_MESSAGE_VERTEX =
  '\nPlease wait and try again later. To increase your limits, request a quota increase through Vertex, or switch to another /auth method';
const getRateLimitErrorMessageDefault = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\nPossible quota limitations in place or slow response times detected. Switching to the ${fallbackModel} model for the rest of this session.`;

function getRateLimitMessage(
  authType?: AuthType,
  fallbackModel?: string,
): string {
  switch (authType) {
    case AuthType.USE_GEMINI:
      return RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI;
    case AuthType.USE_VERTEX_AI:
      return RATE_LIMIT_ERROR_MESSAGE_VERTEX;
    default:
      return getRateLimitErrorMessageDefault(fallbackModel);
  }
}

const PROJECT_DOCS_URL =
  'https://geminicli.com/docs/get-started/authentication/#set-gcp';

/**
 * Actionable hint appended when the API reports a 403 PERMISSION_DENIED /
 * CONSUMER_INVALID error, i.e. the request was billed against a missing or
 * invalid Google Cloud project (for example, OAuth login without
 * GOOGLE_CLOUD_PROJECT set). This is a soft, error-time hint only: it never
 * blocks login or startup, because some users do not need
 * GOOGLE_CLOUD_PROJECT set at all (notably the free tier, which uses a
 * managed project). See https://github.com/google-gemini/gemini-cli/issues/22009
 */
function getMissingProjectHint(userTier?: UserTierId): string {
  if (userTier === UserTierId.FREE) {
    return (
      `\nThis usually means the Google Cloud project used for the request is missing or invalid. ` +
      `Free-tier accounts use a managed project, so first try signing in again ` +
      `(/auth) and retrying. If the problem persists, see ${PROJECT_DOCS_URL}`
    );
  }
  const projectId =
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT_ID'];
  if (!projectId) {
    return (
      `\nThis usually means the Google Cloud project used for the request is missing: ` +
      `GOOGLE_CLOUD_PROJECT (or GOOGLE_CLOUD_PROJECT_ID) is not set. ` +
      `Set it to your string-based project ID and try again. See ${PROJECT_DOCS_URL}`
    );
  }
  return (
    `\nThis usually means the Google Cloud project used for the request is missing or invalid. ` +
    `Check that GOOGLE_CLOUD_PROJECT (or GOOGLE_CLOUD_PROJECT_ID) is set to your ` +
    `string-based project ID (not the numeric project number). See ${PROJECT_DOCS_URL}`
  );
}

function isConsumerInvalidProjectError(
  code: number | undefined,
  status: string | undefined,
  message: string,
  details?: unknown,
): boolean {
  if (code !== 403) {
    return false;
  }
  if (status !== undefined && status !== 'PERMISSION_DENIED') {
    return false;
  }
  if (
    message.includes('CONSUMER_INVALID') ||
    /permission denied on resource project/i.test(message)
  ) {
    return true;
  }
  try {
    return JSON.stringify(details ?? '').includes('CONSUMER_INVALID');
  } catch {
    return false;
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
      text += getRateLimitMessage(authType, fallbackModel);
    } else if (
      isConsumerInvalidProjectError(error.status, undefined, error.message)
    ) {
      text += getMissingProjectHint(userTier);
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
        } catch {
          // It's not a nested JSON error, so we just use the message as is.
        }
        let text = `[API Error: ${finalMessage} (Status: ${parsedError.error.status})]`;
        if (parsedError.error.code === 429) {
          text += getRateLimitMessage(authType, fallbackModel);
        } else if (
          isConsumerInvalidProjectError(
            parsedError.error.code,
            parsedError.error.status,
            finalMessage,
            parsedError.error.details,
          )
        ) {
          text += getMissingProjectHint(userTier);
        }
        return text;
      }
    } catch {
      // Not a valid JSON, fall through and return the original message.
    }
    return `[API Error: ${error}]`;
  }

  return '[API Error: An unknown error occurred.]';
}
