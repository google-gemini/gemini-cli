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

// Structured error typing for consumers that need richer context
export enum ParsedErrorType {
  PRO_QUOTA,
  GENERIC_QUOTA,
  RATE_LIMIT,
  AUTH,
  GENERIC,
}

export interface ParsedError {
  type: ParsedErrorType;
  title: string;
  // Custom user-friendly message (optional, falls back to errorMessage)
  customMessage?: string;
  // Original error message from server
  errorMessage: string;
  rawError: unknown;
  // HTTP status for structured errors (e.g., 429)
  httpStatus?: number;
  // API error fields for JSON error payloads
  apiStatus?: string; // e.g., 'RESOURCE_EXHAUSTED'
  apiCode?: number; // e.g., 429
  // Source of the parsed error (useful for formatting decisions)
  origin?: 'structured' | 'json' | 'text' | 'unknown';
}

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

function isPaidUserTier(userTier?: UserTierId): boolean {
  return userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;
}

// Builds the Google Login rate limit message (no leading newline)
type FormatGoogleLoginRateLimitMessageOptions = {
  quotaType: ParsedErrorType;
  isPaidTier: boolean;
  currentModel?: string;
  fallbackModel?: string;
};

function formatGoogleLoginRateLimitMessage({
  quotaType,
  isPaidTier,
  currentModel = DEFAULT_GEMINI_MODEL,
  fallbackModel = DEFAULT_GEMINI_FLASH_MODEL,
}: FormatGoogleLoginRateLimitMessageOptions): string {
  let message: string;

  switch (quotaType) {
    case ParsedErrorType.PRO_QUOTA:
      message = `You have reached your daily ${currentModel} quota limit. You will be switched to the ${fallbackModel} model for the rest of this session.`;
      break;
    case ParsedErrorType.GENERIC_QUOTA:
      message = 'You have reached your daily quota limit.';
      break;
    case ParsedErrorType.RATE_LIMIT:
    default:
      message = `${DEFAULT_FALLBACK_PREFIX} Switching to the ${fallbackModel} model for the rest of this session.`;
      break;
  }

  if (isPaidTier) {
    message += ` ${APPRECIATION_NOTE}`;
    if (
      quotaType === ParsedErrorType.PRO_QUOTA ||
      quotaType === ParsedErrorType.GENERIC_QUOTA
    ) {
      message += ` To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at ${AI_STUDIO_API_KEY_URL}`;
    }
  } else {
    if (
      quotaType === ParsedErrorType.PRO_QUOTA ||
      quotaType === ParsedErrorType.GENERIC_QUOTA
    ) {
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
      const quotaType = classifyParsedErrorTypeFor429(error);
      const isPaidTier = isPaidUserTier(userTier);
      return (
        '\n' +
        formatGoogleLoginRateLimitMessage({
          quotaType,
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

function classifyParsedErrorTypeFor429(error: unknown): ParsedErrorType {
  if (isProQuotaExceededError(error)) return ParsedErrorType.PRO_QUOTA;
  if (isGenericQuotaExceededError(error)) return ParsedErrorType.GENERIC_QUOTA;
  return ParsedErrorType.RATE_LIMIT;
}

function titleForType(type: ParsedErrorType): string {
  switch (type) {
    case ParsedErrorType.PRO_QUOTA:
    case ParsedErrorType.GENERIC_QUOTA:
      return 'Quota Exceeded';
    case ParsedErrorType.RATE_LIMIT:
      return 'Rate Limit Exceeded';
    case ParsedErrorType.AUTH:
      return 'Authentication Error';
    case ParsedErrorType.GENERIC:
    default:
      return 'API Error';
  }
}

// ----------------------------
// Internal helpers and parsers
// ----------------------------

type ErrorOrigin = 'structured' | 'json' | 'text' | 'unknown';

type ParseContext = {
  authType?: AuthType;
  userTier?: UserTierId;
  currentModel?: string;
  fallbackModel?: string;
};

type NormalizedInput = {
  message: string;
  httpStatus?: number;
  apiStatus?: string;
  apiCode?: number;
  origin: ErrorOrigin;
  rawError: unknown;
};

function buildParsedError(
  base: NormalizedInput,
  type: ParsedErrorType,
  customMessage?: string,
): ParsedError {
  return {
    type,
    title: titleForType(type),
    customMessage,
    errorMessage: base.message,
    rawError: base.rawError,
    httpStatus: base.httpStatus,
    apiStatus: base.apiStatus,
    apiCode: base.apiCode,
    origin: base.origin,
  };
}

function normalizeStructuredError(error: {
  message: string;
  status?: number;
}): NormalizedInput {
  return {
    message: error.message,
    httpStatus: error.status,
    origin: 'structured',
    rawError: error,
  };
}

function unwrapNestedApiMessage(message: string): string {
  try {
    const nested = JSON.parse(message) as unknown;
    if (isApiError(nested)) {
      return nested.error.message;
    }
  } catch {
    // not nested JSON, return as-is
  }
  return message;
}

function normalizeApiJsonError(
  apiErr: { error: { code: number; message: string; status: string } },
  rawError: unknown,
): NormalizedInput {
  const unwrapped = unwrapNestedApiMessage(apiErr.error.message);
  return {
    message: unwrapped,
    apiCode: apiErr.error.code,
    apiStatus: apiErr.error.status,
    origin: 'json',
    rawError,
  };
}

function extractApiErrorFromString(text: string): {
  apiError: { error: { code: number; message: string; status: string } };
} | null {
  // Prefer an anchor for API error payloads if present
  const anchor = text.indexOf('{"error":');
  const start = anchor >= 0 ? anchor : text.indexOf('{');
  if (start === -1) return null;

  // Try to trim trailing noise after JSON by cutting to the last closing brace
  const lastClose = text.lastIndexOf('}');
  const candidate =
    lastClose > start
      ? text.substring(start, lastClose + 1)
      : text.substring(start);

  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (isApiError(parsed)) {
      return {
        apiError: parsed as {
          error: { code: number; message: string; status: string };
        },
      };
    }
  } catch {
    // fallthrough
  }
  return null;
}

function dispatchByStatus(
  normalized: NormalizedInput,
  detectionTarget: unknown,
  ctx: ParseContext,
): ParsedError {
  const status = normalized.httpStatus ?? normalized.apiCode;
  switch (status) {
    case 401:
      return parse401(normalized);
    case 403:
      return parse403(normalized);
    case 429:
      return parse429(normalized, detectionTarget, ctx);
    case 500:
      return parse500(normalized);
    case 502:
      return parse502(normalized);
    case 503:
      return parse503(normalized);
    default:
      return parseDefault(normalized);
  }
}

// Per-status parsers

function parse401(base: NormalizedInput): ParsedError {
  return buildParsedError(base, ParsedErrorType.AUTH);
}

function parse403(base: NormalizedInput): ParsedError {
  return buildParsedError(base, ParsedErrorType.AUTH);
}

function parse429(
  base: NormalizedInput,
  detectionTarget: unknown,
  ctx: ParseContext,
): ParsedError {
  const type = classifyParsedErrorTypeFor429(detectionTarget);

  // Generate custom message for 429 errors based on type and context
  const rateLimitMessage = getRateLimitMessage(
    ctx.authType,
    detectionTarget,
    ctx.userTier,
    ctx.currentModel,
    ctx.fallbackModel,
  );

  // Remove leading newline since it's now part of the message itself
  const customMessage = rateLimitMessage.startsWith('\n')
    ? rateLimitMessage.slice(1)
    : rateLimitMessage;

  return buildParsedError(base, type, customMessage);
}

function parse500(base: NormalizedInput): ParsedError {
  return buildParsedError(base, ParsedErrorType.GENERIC);
}

function parse502(base: NormalizedInput): ParsedError {
  return buildParsedError(base, ParsedErrorType.GENERIC);
}

function parse503(base: NormalizedInput): ParsedError {
  return buildParsedError(base, ParsedErrorType.GENERIC);
}

function parseDefault(base: NormalizedInput): ParsedError {
  return buildParsedError(base, ParsedErrorType.GENERIC);
}

function parseStructured(
  error: { message: string; status?: number },
  ctx: ParseContext,
): ParsedError {
  const normalized = normalizeStructuredError(error);
  if (typeof error.status === 'number') {
    return dispatchByStatus(normalized, error, ctx);
  }
  return parseDefault(normalized);
}

function parseStringError(errorText: string, ctx: ParseContext): ParsedError {
  const extracted = extractApiErrorFromString(errorText);
  if (extracted) {
    const normalized = normalizeApiJsonError(extracted.apiError, errorText);
    return dispatchByStatus(normalized, extracted.apiError, ctx);
  }

  // Plain text fallback
  return buildParsedError(
    { message: errorText, origin: 'text', rawError: errorText },
    ParsedErrorType.GENERIC,
  );
}

// ----------------------------
// Public API
// ----------------------------

export function parseError(
  error: unknown,
  authType?: AuthType,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): ParsedError {
  const ctx: ParseContext = { authType, userTier, currentModel, fallbackModel };

  // 1) Structured error path
  if (isStructuredError(error)) {
    return parseStructured(error, ctx);
  }

  // 2) String path (might contain JSON API error)
  if (typeof error === 'string') {
    return parseStringError(error, ctx);
  }

  // 3) Unknown path
  return buildParsedError(
    {
      message: 'An unknown error occurred.',
      origin: 'unknown',
      rawError: error,
    },
    ParsedErrorType.GENERIC,
  );
}

/**
 * @deprecated Use parseError() for structured error handling. This function
 * is maintained for backward compatibility only.
 *
 * Consumers should migrate to calling `parseError()` and then using the returned
 * `ParsedError` object to format messages as needed. The `customMessage`
 * property, when present, is the preferred user-facing message.
 */
export function parseAndFormatApiError(
  error: unknown,
  authType?: AuthType,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): string {
  const parsed = parseError(
    error,
    authType,
    userTier,
    currentModel,
    fallbackModel,
  );

  // Preserve existing formatting semantics:
  // - Always prefix with [API Error: ...]
  // - Include (Status: ...) only for API JSON errors
  // - Append rate limit advice (with leading newline) after the bracketed text
  let text = `[API Error: ${parsed.errorMessage}`;
  if (parsed.origin === 'json') {
    text += ` (Status: ${parsed.apiStatus})`;
  }
  text += ']';

  // For 429 errors with custom messages, append with newline
  if (
    parsed.customMessage &&
    (parsed.type === ParsedErrorType.PRO_QUOTA ||
      parsed.type === ParsedErrorType.GENERIC_QUOTA ||
      parsed.type === ParsedErrorType.RATE_LIMIT)
  ) {
    text += '\n' + parsed.customMessage;
  }

  return text;
}
