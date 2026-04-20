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
  let message: string;
  if (friendlyError instanceof Error) {
    message = friendlyError.message;
  } else if (
    typeof friendlyError === 'object' &&
    friendlyError !== null &&
    'message' in friendlyError &&
    typeof (friendlyError as { message: unknown }).message === 'string'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    message = (friendlyError as { message: string }).message;
  } else {
    try {
      message = String(friendlyError);
    } catch {
      return 'Failed to get error details';
    }
  }
  return decodeErrorMessage(message);
}

/**
 * Attempts to decode an error message that may contain raw byte codes
 * (comma-separated numeric values from a Uint8Array/Buffer toString) or
 * a raw JSON error body, returning a human-readable error message.
 */
export function decodeErrorMessage(message: string): string {
  // Step 1: If the message looks like comma-separated byte codes
  // (e.g., "123,34,101,114,114,111,114,34"), decode it first.
  const decoded = tryDecodeByteCodeString(message);
  if (decoded !== null) {
    message = decoded;
  }

  // Step 2: Try to extract a human-readable message from JSON error bodies.
  // API errors often arrive as JSON like:
  //   {"error":{"message":"The actual error text","code":400,...}}
  // or prefixed with status info like:
  //   got status: RESOURCE_EXHAUSTED. {"error":{...}}
  return tryExtractJsonErrorMessage(message) ?? message;
}

/**
 * Tries to decode a string of comma-separated byte codes into text.
 * Returns null if the string does not appear to be byte codes.
 */
function tryDecodeByteCodeString(value: string): string | null {
  // Must contain at least one comma and only digits, commas, and whitespace
  if (!value.includes(',') || !/^[\d,\s]+$/.test(value)) {
    return null;
  }
  try {
    const bytes = value.split(',').map(Number);
    if (bytes.some((b) => isNaN(b) || b < 0 || b > 255)) {
      return null;
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/**
 * Tries to extract a human-readable error message from a JSON error string.
 * Handles formats like:
 *   {"error":{"message":"...","code":400,"status":"..."}}
 *   got status: RESOURCE_EXHAUSTED. {"error":{...}}
 * Returns null if the message is not a recognized JSON error format.
 */
function tryExtractJsonErrorMessage(message: string): string | null {
  const jsonStart = message.indexOf('{');
  if (jsonStart === -1) {
    return null;
  }

  try {
    const parsed = JSON.parse(message.substring(jsonStart)) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof (parsed as { error: unknown }).error === 'object' &&
      (parsed as { error: unknown }).error !== null
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const errorObj = (parsed as { error: { message?: string } }).error;
      if (typeof errorObj.message === 'string') {
        return errorObj.message;
      }
    }
  } catch {
    // Not valid JSON, return null
  }
  return null;
}

export function getErrorType(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';

  // Return constructor name if the generic 'Error' name is used (for custom errors)
  return error.name === 'Error'
    ? (error.constructor?.name ?? 'Error')
    : error.name;
}

export class FatalError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

export class FatalAuthenticationError extends FatalError {
  constructor(message: string) {
    super(message, 41);
  }
}
export class FatalInputError extends FatalError {
  constructor(message: string) {
    super(message, 42);
  }
}
export class FatalSandboxError extends FatalError {
  constructor(message: string) {
    super(message, 44);
  }
}
export class FatalConfigError extends FatalError {
  constructor(message: string) {
    super(message, 52);
  }
}
export class FatalTurnLimitedError extends FatalError {
  constructor(message: string) {
    super(message, 53);
  }
}
export class FatalToolExecutionError extends FatalError {
  constructor(message: string) {
    super(message, 54);
  }
}
export class FatalCancellationError extends FatalError {
  constructor(message: string) {
    super(message, 130); // Standard exit code for SIGINT
  }
}

export class CanceledError extends Error {
  constructor(message = 'The operation was canceled.') {
    super(message);
    this.name = 'CanceledError';
  }
}

export class ForbiddenError extends Error {}
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
export class UnauthorizedError extends Error {}
export class BadRequestError extends Error {}

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

/**
 * Checks if an error is a 401 authentication error.
 * Uses structured error properties from MCP SDK errors.
 *
 * @param error The error to check
 * @returns true if this is a 401/authentication error
 */
export function isAuthenticationError(error: unknown): boolean {
  // Check for MCP SDK errors with code property
  // (SseError and StreamableHTTPError both have numeric 'code' property)
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number'
  ) {
    // Safe access after check
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const errorCode = (error as { code: number }).code;
    if (errorCode === 401) {
      return true;
    }
  }

  // Check for UnauthorizedError class (from MCP SDK or our own)
  if (
    error instanceof Error &&
    error.constructor.name === 'UnauthorizedError'
  ) {
    return true;
  }

  if (error instanceof UnauthorizedError) {
    return true;
  }

  // Fallback: Check for MCP SDK's plain Error messages with HTTP 401
  // The SDK sometimes throws: new Error(`Error POSTing to endpoint (HTTP 401): ...`)
  const message = getErrorMessage(error);
  if (message.includes('401')) {
    return true;
  }

  return false;
}
