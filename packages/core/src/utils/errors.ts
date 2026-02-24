/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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

export function getErrorMessage(error: unknown): string {
  const friendlyError = toFriendlyError(error);
  if (friendlyError instanceof Error) {
    return friendlyError.message;
  }
  try {
    return String(friendlyError);
  } catch {
    return 'Failed to get error details';
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
  if (isGaxiosError(error)) {
    const data = parseResponseData(error);
    if (data && data.error && data.error.message && data.error.code) {
      switch (data.error.code) {
        case 400:
          return new BadRequestError(data.error.message);
        case 401:
          return new UnauthorizedError(data.error.message);
        case 403:
          // It's import to pass the message here since it might
          // explain the cause like "the cloud project you're
          // using doesn't have code assist enabled".
          return new ForbiddenError(data.error.message);
        default:
      }
    }
  }
  return error;
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
