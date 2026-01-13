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

interface ResponseData {
  error?: {
    code?: number;
    message?: string;
  };
}

export function toFriendlyError(error: unknown): unknown {
  if (error && typeof error === 'object' && 'response' in error) {
    const gaxiosError = error as GaxiosError;
    const data = parseResponseData(gaxiosError);
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
  // Inexplicably, Gaxios sometimes doesn't JSONify the response data.
  if (typeof error.response?.data === 'string') {
    try {
      return JSON.parse(error.response?.data) as ResponseData;
    } catch {
      return undefined;
    }
  }
  return error.response?.data as ResponseData | undefined;
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
  if (error && typeof error === 'object' && 'code' in error) {
    const errorCode = (error as { code: unknown }).code;
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
