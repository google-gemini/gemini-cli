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
  return decodeByteCodedString(message);
}

/**
 * Detects if a string looks like comma-separated byte values (e.g. from a
 * Uint8Array that was coerced to string via its default toString()) and
 * decodes it to readable UTF-8 text.
 *
 * Example input:  "91,123,10,32,32,34,101,114,114,111,114,34,58,32,123,10"
 * Example output: '[{\n  "error": {\n'
 */
export function decodeByteCodedString(value: string): string {
  if (!value || !value.includes(',')) {
    return value;
  }

  // The message may have a prefix like "got status: 429 Too Many Requests. "
  // followed by the byte-coded body. Try to find where the byte codes start.
  const decoded = tryDecodeBytes(value);
  if (decoded !== null) {
    return decoded;
  }

  // Try splitting on ". " to find a prefix + byte-coded body
  const dotIndex = value.lastIndexOf('. ');
  if (dotIndex !== -1) {
    const prefix = value.substring(0, dotIndex + 2);
    const rest = value.substring(dotIndex + 2);
    const decodedRest = tryDecodeBytes(rest);
    if (decodedRest !== null) {
      return prefix + decodedRest;
    }
  }

  return value;
}

/**
 * Attempts to decode a string of comma-separated byte values into UTF-8 text.
 * Returns the decoded string, or null if the input doesn't look like byte codes.
 */
function tryDecodeBytes(value: string): string | null {
  const parts = value.split(',');
  // Require at least a few parts to avoid false positives on normal text with commas
  if (parts.length < 4) {
    return null;
  }
  const bytes: number[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    // Each part must be a non-negative integer in the byte range 0-255
    if (!/^\d{1,3}$/.test(trimmed)) {
      return null;
    }
    const num = Number(trimmed);
    if (num > 255 || (trimmed.length > 1 && trimmed.startsWith('0'))) {
      return null;
    }
    bytes.push(num);
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
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
