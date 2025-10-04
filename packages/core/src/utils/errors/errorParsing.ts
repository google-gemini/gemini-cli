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
} from '../quotaErrorDetection.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from '../../config/models.js';
import { UserTierId, AuthType } from '../../config/authTypes.js';
import type { ParsedError, GaxiosError, ResponseData } from './errorTypes.js';
import { ParsedErrorType, FatalError } from './errorTypes.js';
import { classifyGoogleError } from '../googleQuotaErrors.js';

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

// ----------------------------
// Helper functions from errors.ts
// ----------------------------

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return String(error);
  } catch {
    return 'Failed to get error details';
  }
}

// ----------------------------
// Compatibility layer for migration
// ----------------------------

/**
 * Factory function to create a FatalError with specified exit code
 * @param message - The error message
 * @param exitCode - The process exit code
 */
export function createFatalError(
  message: string,
  exitCode: number,
): FatalError {
  return new FatalError(message, exitCode);
}

/**
 * Type guard to check if an error is a FatalError
 * @param error - The error to check
 */
export function isFatalError(error: unknown): error is FatalError {
  return error instanceof FatalError;
}

// ----------------------------
// Internal parsing functions
// ----------------------------

function isResponseData(data: unknown): data is ResponseData {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  if (!('error' in obj)) return true; // Empty response is valid

  const error = obj['error'];
  if (!error || typeof error !== 'object') return false;

  const errorObj = error as Record<string, unknown>;
  // Check that error has expected structure if present
  if ('code' in errorObj && typeof errorObj['code'] !== 'number') return false;
  if ('message' in errorObj && typeof errorObj['message'] !== 'string')
    return false;

  return true;
}

function parseResponseData(error: GaxiosError): ResponseData {
  // Inexplicably, Gaxios sometimes doesn't JSONify the response data.
  if (typeof error.response?.data === 'string') {
    const parsed = JSON.parse(error.response?.data) as unknown;
    return isResponseData(parsed) ? parsed : {};
  }
  const data = error.response?.data;
  return isResponseData(data) ? data : {};
}

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
      return formatGoogleLoginRateLimitMessage({
        quotaType,
        isPaidTier,
        currentModel: sanitizedCurrent,
        fallbackModel: sanitizedFallback,
      });
    }
    case AuthType.USE_GEMINI:
      return RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI;
    case AuthType.USE_VERTEX_AI:
      return RATE_LIMIT_ERROR_MESSAGE_VERTEX;
    default:
      return `${DEFAULT_FALLBACK_PREFIX} Switching to the ${sanitizedFallback} model for the rest of this session.`;
  }
}

function classifyParsedErrorTypeFor429(error: unknown): ParsedErrorType {
  // Try Google-specific classification first
  const googleClassification = classifyGoogleError(error);
  if (googleClassification) {
    if (googleClassification.type === 'TERMINAL_QUOTA') {
      // Map to legacy types based on error message for backward compatibility
      if (isProQuotaExceededError(error)) return ParsedErrorType.PRO_QUOTA;
      if (isGenericQuotaExceededError(error))
        return ParsedErrorType.GENERIC_QUOTA;
      return ParsedErrorType.TERMINAL_QUOTA;
    }
    return ParsedErrorType.RETRYABLE_QUOTA;
  }

  // Fall back to legacy detection
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

type ErrorOrigin = 'structured' | 'json' | 'text' | 'gaxios' | 'unknown';

type ParseContext = {
  authType?: AuthType;
  userTier?: UserTierId;
  currentModel?: string;
  fallbackModel?: string;
};

type NormalizedInput = {
  message: string;
  statusCode?: number;
  apiStatus?: string;
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
    statusCode: base.statusCode,
    apiStatus: base.apiStatus,
    origin: base.origin as ParsedError['origin'],
  };
}

function normalizeStructuredError(error: {
  message: string;
  status?: number;
}): NormalizedInput {
  return {
    message: error.message,
    statusCode: error.status,
    origin: 'structured',
    rawError: error,
  };
}

function normalizeGaxiosError(error: GaxiosError): NormalizedInput | null {
  const data = parseResponseData(error);
  if (data.error && data.error.message && data.error.code) {
    return {
      message: data.error.message,
      statusCode: data.error.code,
      origin: 'gaxios',
      rawError: error,
    };
  }
  return null;
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
    statusCode: apiErr.error.code,
    apiStatus: apiErr.error.status,
    origin: 'json',
    rawError,
  };
}

// TODO: This function is a compatibility layer to handle cases where a
// structured API error is embedded as a JSON string within another error's
// message. As the UI fully transitions to consuming pre-parsed `ParsedError`
// objects (e.g., via the InformationDialog), this manual string extraction
// will become obsolete and should be removed.
function extractApiErrorFromString(text: string): {
  apiError: { error: { code: number; message: string; status: string } };
} | null {
  // Prefer an anchor for API error payloads if present
  const anchor = text.indexOf('{"error":');
  const start = anchor >= 0 ? anchor : text.indexOf('{');
  if (start === -1) return null;

  let braceCount = 0;
  let end = -1;

  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') {
      braceCount++;
    } else if (text[i] === '}') {
      braceCount--;
    }

    if (braceCount === 0) {
      end = i;
      break;
    }
  }

  if (end === -1) return null;

  const candidate = text.substring(start, end + 1);

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
  switch (normalized.statusCode) {
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
  // Try Google-specific classification first
  const googleClassification = classifyGoogleError(detectionTarget);
  if (googleClassification) {
    const type =
      googleClassification.type === 'TERMINAL_QUOTA'
        ? ParsedErrorType.TERMINAL_QUOTA
        : ParsedErrorType.RETRYABLE_QUOTA;

    // Generate custom message for 429 errors based on type and context
    const customMessage = getRateLimitMessage(
      ctx.authType,
      detectionTarget,
      ctx.userTier,
      ctx.currentModel,
      ctx.fallbackModel,
    );

    const result = buildParsedError(base, type, customMessage);
    result.provider = 'google';
    result.retryDelayMs = googleClassification.retryDelayMs;
    return result;
  }

  // Fallback to existing classification
  const type = classifyParsedErrorTypeFor429(detectionTarget);

  // Generate custom message for 429 errors based on type and context
  const customMessage = getRateLimitMessage(
    ctx.authType,
    detectionTarget,
    ctx.userTier,
    ctx.currentModel,
    ctx.fallbackModel,
  );

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
  // Try to unwrap a nested API error JSON embedded in the message
  // Example: {"error":{"code":400,"message":"{...}","status":"Bad Request"}}
  const extracted = extractApiErrorFromString(error.message);
  if (extracted) {
    const normalizedFromJson = normalizeApiJsonError(extracted.apiError, error);
    return dispatchByStatus(normalizedFromJson, extracted.apiError, ctx);
  }

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

/**
 * Parse any error into a structured ParsedError object.
 * This is the single source of truth for error analysis.
 *
 * @param error - The error to parse (can be any type)
 * @param authType - The authentication type for context-aware messages
 * @param userTier - The user tier for tailored rate limit messages
 * @param currentModel - The current model being used
 * @param fallbackModel - The fallback model to switch to
 */
export function parseError(
  error: unknown,
  authType?: AuthType,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): ParsedError {
  const ctx: ParseContext = { authType, userTier, currentModel, fallbackModel };

  // 1) Check for Gaxios errors first (to preserve origin and expected behavior)
  if (error && typeof error === 'object' && 'response' in error) {
    const normalized = normalizeGaxiosError(error as GaxiosError);
    if (normalized) {
      return dispatchByStatus(normalized, error, ctx);
    }
  }

  // 2) Structured error path
  if (isStructuredError(error)) {
    return parseStructured(error, ctx);
  }

  // 3) String path (might contain JSON API error)
  if (typeof error === 'string') {
    return parseStringError(error, ctx);
  }

  // 4) Error object with message
  if (error !== null && typeof error === 'object' && error instanceof Error) {
    return buildParsedError(
      {
        message: error.message,
        origin: 'text',
        rawError: error,
      },
      ParsedErrorType.GENERIC,
    );
  }

  // 5) Unknown path
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
 * is maintained for backward compatibility only and will be removed in v2.0.0.
 *
 * Migration guide:
 * ```typescript
 * // Old way (deprecated):
 * const errorText = parseAndFormatApiError(error, authType, userTier);
 * console.error(errorText);
 *
 * // New way (recommended):
 * const parsed = parseError(error, authType, userTier);
 * const message = parsed.customMessage || parsed.errorMessage;
 * console.error(`[${parsed.title}] ${message}`);
 * ```
 *
 * The `customMessage` property, when present, is the preferred user-facing message.
 * Scheduled for removal: v2.0.0 (tentative: Q2 2025)
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
      parsed.type === ParsedErrorType.RATE_LIMIT ||
      parsed.type === ParsedErrorType.TERMINAL_QUOTA ||
      parsed.type === ParsedErrorType.RETRYABLE_QUOTA)
  ) {
    text += '\n' + parsed.customMessage;
  }

  return text;
}
