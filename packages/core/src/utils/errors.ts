/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { parseGoogleApiError, type ErrorInfo } from './googleErrors.js';

interface GaxiosError {
  response?: {
    data?: unknown;
  };
}

function isGaxiosError(error: unknown): error is GaxiosError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response: unknown }).response === 'object' &&
    (error as { response: unknown }).response !== null
  );
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Checks if an error is an AbortError.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function getErrorMessage(error: unknown): string {
  const friendlyError = toFriendlyError(error);
  if (friendlyError instanceof Error) {
    return friendlyError.message;
  }
  if (
    typeof friendlyError === 'object' &&
    friendlyError !== null &&
    'message' in friendlyError &&
    typeof (friendlyError as { message: unknown }).message === 'string'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return (friendlyError as { message: string }).message;
  }
  try {
    return String(friendlyError);
  } catch {
    return 'Failed to get error details';
  }
}

export function getErrorType(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';

  // Use the constructor name if the standard error name is missing or generic.
  const name =
    error.name && error.name !== 'Error'
      ? error.name
      : (error.constructor?.name ?? 'Error');

  // Strip leading underscore from error names. Bundlers like esbuild sometimes
  // rename classes to avoid scope collisions.
  return name.replace(/^_+/, '');
}

export class FatalError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = 'FatalError';
  }
}

export class FatalAuthenticationError extends FatalError {
  constructor(message: string) {
    super(message, 41);
    this.name = 'FatalAuthenticationError';
  }
}
export class FatalInputError extends FatalError {
  constructor(message: string) {
    super(message, 42);
    this.name = 'FatalInputError';
  }
}
export class FatalSandboxError extends FatalError {
  constructor(message: string) {
    super(message, 44);
    this.name = 'FatalSandboxError';
  }
}
export class FatalConfigError extends FatalError {
  constructor(message: string) {
    super(message, 52);
    this.name = 'FatalConfigError';
  }
}
export class FatalTurnLimitedError extends FatalError {
  constructor(message: string) {
    super(message, 53);
    this.name = 'FatalTurnLimitedError';
  }
}
export class FatalToolExecutionError extends FatalError {
  constructor(message: string) {
    super(message, 54);
    this.name = 'FatalToolExecutionError';
  }
}
export class FatalUntrustedWorkspaceError extends FatalError {
  constructor(message: string) {
    super(message, 55);
    this.name = 'FatalUntrustedWorkspaceError';
  }
}
export class FatalCancellationError extends FatalError {
  constructor(message: string, exitCode = 130) {
    super(message, exitCode); // Standard exit code for SIGINT by default
    this.name = 'FatalCancellationError';
  }
}

export class CanceledError extends Error {
  constructor(message = 'The operation was canceled.') {
    super(message);
    this.name = 'CanceledError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}
export class AccountSuspendedError extends ForbiddenError {
  readonly appealUrl?: string;
  readonly appealLinkText?: string;

  constructor(message: string, metadata?: Record<string, string>) {
    super(message);
    this.name = 'AccountSuspendedError';
    this.appealUrl = metadata?.['appeal_url'];
    this.appealLinkText = metadata?.['appeal_url_link_text'];
  }
}
export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class ChangeAuthRequestedError extends Error {
  constructor() {
    super('User requested to change authentication method');
    this.name = 'ChangeAuthRequestedError';
  }
}

interface ResponseData {
  error?: {
    code?: number;
    message?: string;
  };
}

function isResponseData(data: unknown): data is ResponseData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const candidate = data as ResponseData;
  if (!('error' in candidate)) {
    return false;
  }
  const error = candidate.error;
  if (typeof error !== 'object' || error === null) {
    return false; // error property exists but is not an object (could be undefined, but we checked 'in')
  }

  // Optional properties check
  if (
    'code' in error &&
    typeof error.code !== 'number' &&
    error.code !== undefined
  ) {
    return false;
  }
  if (
    'message' in error &&
    typeof error.message !== 'string' &&
    error.message !== undefined
  ) {
    return false;
  }

  return true;
}

export function toFriendlyError(error: unknown): unknown {
  // First, try structured parsing for TOS_VIOLATION detection.
  const googleApiError = parseGoogleApiError(error);
  if (googleApiError && googleApiError.code === 403) {
    const tosDetail = googleApiError.details.find(
      (d): d is ErrorInfo =>
        d['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' &&
        'reason' in d &&
        d.reason === 'TOS_VIOLATION',
    );
    if (tosDetail) {
      return new AccountSuspendedError(
        googleApiError.message,
        tosDetail.metadata,
      );
    }
  }

  // Fall back to basic Gaxios error parsing for other HTTP errors.
  if (isGaxiosError(error)) {
    const data = parseResponseData(error);
    if (data && data.error && data.error.message && data.error.code) {
      switch (data.error.code) {
        case 400:
          return new BadRequestError(data.error.message);
        case 401:
          return new UnauthorizedError(data.error.message);
        case 403:
          return new ForbiddenError(data.error.message);
        default:
      }
    }
  }
  return error;
}

export function isAccountSuspendedError(
  error: unknown,
): AccountSuspendedError | null {
  const friendly = toFriendlyError(error);
  return friendly instanceof AccountSuspendedError ? friendly : null;
}

function parseResponseData(error: GaxiosError): ResponseData | undefined {
  let data = error.response?.data;
  // Inexplicably, Gaxios sometimes doesn't JSONify the response data.
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return undefined;
    }
  }

  if (isResponseData(data)) {
    return data;
  }
  return undefined;
}

const HTTP_401_REGEX =
  /(?:\bHTTP(?:\/\d(?:\.\d)?)?(?:\s+(?:status|error))?|(?<!\b(?:exit|exited)\s+(?:with\s+)?)\bstatus(?:code|\s*code)?)[:\s]+401\b|(?:\b401\b[^\w\r\n]{1,4}\bUnauthorized\b|\bUnauthorized\b[^\w\r\n]{1,4}\b401\b)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REDACTED_ERROR_KEYS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-goog-api-key',
  'x-api-key',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
]);

const OMITTED_TRANSPORT_KEYS = new Set([
  'agent',
  'socket',
  'connection',
  'client',
  'req',
  'res',
  'request',
  '_readablestate',
  '_writablestate',
  '_events',
  '_eventscount',
  'rawheaders',
]);

function safeGet(target: object, key: string): unknown {
  if (!isRecord(target)) {
    return undefined;
  }
  try {
    return target[key];
  } catch {
    return undefined;
  }
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStatusOrCode(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

function toSafeSerializable(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol' || typeof value === 'function') {
    return String(value);
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  if (depth >= 8) {
    return '[MaxDepth]';
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => toSafeSerializable(item, seen, depth + 1));
    }

    const output: Record<string, unknown> = {};
    if (value instanceof Error) {
      output['name'] = value.name;
      output['message'] = value.message;
      if (value.stack) {
        output['stack'] = value.stack;
      }
      if ('cause' in value && value.cause !== undefined) {
        output['cause'] = toSafeSerializable(value.cause, seen, depth + 1);
      }
    }

    let keys: string[] = [];
    try {
      keys = Object.keys(value);
    } catch {
      keys = [];
    }

    for (const key of keys) {
      const normalizedKey = key.toLowerCase();
      if (OMITTED_TRANSPORT_KEYS.has(normalizedKey)) {
        continue;
      }
      if (REDACTED_ERROR_KEYS.has(normalizedKey)) {
        output[key] = '[REDACTED]';
        continue;
      }
      const propValue = safeGet(value, key);
      if (propValue !== undefined && typeof propValue !== 'function') {
        output[key] = toSafeSerializable(propValue, seen, depth + 1);
      }
    }

    return output;
  } finally {
    seen.delete(value);
  }
}

/**
 * Serializes arbitrary error values into JSON safely, handling circular
 * references, BigInt values, non-enumerable Error fields, sensitive headers,
 * and raw HTTP socket/agent handles without throwing.
 */
export function safeSerializeErrorValue(
  value: unknown,
  space?: number,
): string {
  try {
    const serializable = toSafeSerializable(value, new WeakSet<object>(), 0);
    const json = JSON.stringify(serializable, null, space);
    return json ?? String(serializable);
  } catch {
    return 'Unserializable error object';
  }
}

export interface NormalizedErrorInfo {
  message: string;
  status?: number | string;
  code?: number | string;
  details?: unknown;
  originalError: unknown;
}

/**
 * Extracts normalized diagnostic information (message, status, code, details)
 * defensively from arbitrary error shapes (Google Cloud / Gaxios errors,
 * OAuth2 / JSON-RPC payloads, StructuredError, standard Error + cause,
 * primitives, circular objects, and empty values).
 */
export function normalizeError(error: unknown): NormalizedErrorInfo {
  if (error === null || error === undefined) {
    return {
      message: 'Unknown error occurred (empty payload)',
      originalError: error,
    };
  }

  if (typeof error !== 'object') {
    let text = '';
    try {
      text = String(error).trim();
    } catch {
      text = '';
    }
    return {
      message: text || 'Unknown error occurred (empty payload)',
      originalError: error,
    };
  }

  let googleMessage: string | undefined;
  let googleCode: number | undefined;
  let googleDetails: unknown;
  try {
    const googleApiError = parseGoogleApiError(error);
    if (googleApiError && typeof googleApiError.code === 'number') {
      googleMessage = asNonEmptyString(googleApiError.message);
      googleCode = googleApiError.code;
      if (
        Array.isArray(googleApiError.details) &&
        googleApiError.details.length > 0
      ) {
        googleDetails = googleApiError.details;
      }
    }
  } catch {
    // Fall back to structural property inspection below.
  }

  let responseStatus: number | string | undefined;
  let responseErrorMessage: string | undefined;
  let responseErrorCode: number | string | undefined;
  let responseErrorStatus: number | string | undefined;
  let responseErrorDetails: unknown;
  let responseTextFallback: string | undefined;

  const response = safeGet(error, 'response');
  if (isRecord(response)) {
    responseStatus =
      asStatusOrCode(safeGet(response, 'status')) ??
      asStatusOrCode(safeGet(response, 'statusCode'));

    let rawData = safeGet(response, 'data');
    if (typeof rawData === 'string') {
      const trimmedData = rawData.trim();
      try {
        rawData = JSON.parse(trimmedData);
      } catch {
        if (
          trimmedData.length > 0 &&
          trimmedData.length <= 500 &&
          !trimmedData.startsWith('<')
        ) {
          responseTextFallback = trimmedData;
        }
      }
    }

    if (isRecord(rawData)) {
      const dataError = safeGet(rawData, 'error');
      if (isRecord(dataError)) {
        responseErrorMessage = asNonEmptyString(safeGet(dataError, 'message'));
        responseErrorCode = asStatusOrCode(safeGet(dataError, 'code'));
        responseErrorStatus = asStatusOrCode(safeGet(dataError, 'status'));
        responseErrorDetails = safeGet(dataError, 'details');
      } else if (typeof dataError === 'string') {
        const errorName = dataError.trim();
        const errorDescription = asNonEmptyString(
          safeGet(rawData, 'error_description'),
        );
        if (errorName && errorDescription) {
          responseErrorMessage = `${errorName}: ${errorDescription}`;
        } else if (errorDescription) {
          responseErrorMessage = errorDescription;
        } else if (errorName) {
          responseErrorMessage = errorName;
        }
        responseErrorCode = asStatusOrCode(errorName);
      } else {
        responseErrorMessage =
          asNonEmptyString(safeGet(rawData, 'error_description')) ??
          asNonEmptyString(safeGet(rawData, 'message'));
        responseErrorDetails = safeGet(rawData, 'details');
      }
    }
  }

  let nestedMessage: string | undefined;
  let nestedCode: number | string | undefined;
  let nestedStatus: number | string | undefined;
  let nestedDetails: unknown;

  const nestedError = safeGet(error, 'error');
  if (isRecord(nestedError)) {
    nestedMessage = asNonEmptyString(safeGet(nestedError, 'message'));
    nestedCode = asStatusOrCode(safeGet(nestedError, 'code'));
    nestedStatus = asStatusOrCode(safeGet(nestedError, 'status'));
    nestedDetails =
      safeGet(nestedError, 'details') ?? safeGet(nestedError, 'data');
  } else if (typeof nestedError === 'string') {
    nestedMessage = asNonEmptyString(nestedError);
  }

  let causeMessage: string | undefined;
  let causeCode: number | string | undefined;
  let causeStatus: number | string | undefined;

  const cause = safeGet(error, 'cause');
  if (typeof cause === 'object' && cause !== null) {
    causeMessage = asNonEmptyString(safeGet(cause, 'message'));
    causeCode = asStatusOrCode(safeGet(cause, 'code'));
    causeStatus =
      asStatusOrCode(safeGet(cause, 'status')) ??
      asStatusOrCode(safeGet(cause, 'statusCode'));
  } else if (typeof cause === 'string') {
    causeMessage = asNonEmptyString(cause);
  }

  const ownMessage = asNonEmptyString(safeGet(error, 'message'));
  const effectiveOwnMessage =
    ownMessage &&
    causeMessage &&
    ownMessage.toLowerCase() === 'fetch failed' &&
    !ownMessage.includes(causeMessage)
      ? `${ownMessage}: ${causeMessage}`
      : ownMessage;

  const extractedMessage =
    googleMessage ??
    responseErrorMessage ??
    nestedMessage ??
    effectiveOwnMessage ??
    causeMessage ??
    responseTextFallback ??
    '';

  const ownStatus =
    asStatusOrCode(safeGet(error, 'status')) ??
    asStatusOrCode(safeGet(error, 'statusCode'));
  const ownCode = asStatusOrCode(safeGet(error, 'code'));

  const status =
    responseStatus ??
    googleCode ??
    ownStatus ??
    responseErrorCode ??
    nestedStatus ??
    nestedCode ??
    ownCode ??
    causeStatus ??
    causeCode ??
    responseErrorStatus;

  const code =
    ownCode ?? responseErrorCode ?? googleCode ?? nestedCode ?? causeCode;

  const details =
    googleDetails ??
    responseErrorDetails ??
    safeGet(error, 'details') ??
    nestedDetails;

  let finalMessage = extractedMessage;
  if (!finalMessage) {
    const serialized = safeSerializeErrorValue(error);
    finalMessage =
      serialized && serialized !== '{}'
        ? serialized
        : 'Unknown error occurred (empty object)';
  }

  return {
    message: finalMessage,
    status,
    code,
    details,
    originalError: error,
  };
}

/**
 * Checks if an error is a 401 authentication error.
 * Uses structured error properties from MCP SDK errors.
 *
 * @param error The error to check
 * @returns true if this is a 401/authentication error
 */
export function isAuthenticationError(error: unknown): boolean {
  const friendly = toFriendlyError(error);
  if (friendly instanceof UnauthorizedError) {
    return true;
  }

  // Check for structured error properties (e.g. MCP SDK, HTTP clients)
  if (isRecord(error)) {
    const code = error['code'] ?? error['status'] ?? error['statusCode'];
    if (code === 401 || code === '401') {
      return true;
    }

    const response = error['response'];
    if (isRecord(response)) {
      const responseCode = response['status'] ?? response['statusCode'];
      if (responseCode === 401 || responseCode === '401') {
        return true;
      }
    }
  }

  // Check for UnauthorizedError class (from MCP SDK or our own)
  if (error instanceof Error && error.name === 'UnauthorizedError') {
    return true;
  }

  if (error instanceof UnauthorizedError) {
    return true;
  }

  // Fallback: Check for MCP SDK's plain Error messages with HTTP 401
  // The SDK sometimes throws: new Error(`Error POSTing to endpoint (HTTP 401): ...`)
  const message = getErrorMessage(error);
  if (HTTP_401_REGEX.test(message)) {
    return true;
  }

  return false;
}
