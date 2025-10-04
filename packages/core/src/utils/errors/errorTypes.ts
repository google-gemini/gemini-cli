/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Exit Code Reference
 *
 * Fatal errors use specific exit codes to allow scripts and tools to
 * distinguish between different error types:
 *
 * @exitcode 41 - Authentication errors (FatalAuthenticationError)
 * @exitcode 42 - Input validation errors (FatalInputError)
 * @exitcode 44 - Sandbox/environment errors (FatalSandboxError)
 * @exitcode 52 - Configuration errors (FatalConfigError)
 * @exitcode 53 - Turn limit exceeded (FatalTurnLimitedError)
 * @exitcode 54 - Tool execution errors (FatalToolExecutionError)
 * @exitcode 130 - User cancellation/SIGINT (FatalCancellationError)
 *
 * To add a new exit code:
 * 1. Choose an unused code (avoid conflicts with standard codes like 1, 2, 126-165)
 * 2. Add it to this reference table
 * 3. Create a corresponding FatalError subclass
 */

/**
 * Structured error interface for error events
 * (moved from core/turn.ts)
 */
export interface StructuredError {
  message: string;
  status?: number;
}

/**
 * Parsed error with rich metadata for error classification
 */
export interface ParsedError {
  type: ParsedErrorType;
  title: string;
  // Custom user-friendly message (optional, falls back to errorMessage)
  customMessage?: string;
  // Original error message from server
  errorMessage: string;
  rawError: unknown;
  // Unified HTTP status for structured or JSON errors (e.g., 429)
  statusCode?: number;
  // API error status string for JSON error payloads (e.g., 'RESOURCE_EXHAUSTED')
  apiStatus?: string;
  // Source of the parsed error (useful for formatting decisions)
  origin?: 'structured' | 'json' | 'text' | 'unknown';
  // Provider identifier for provider-specific error handling
  provider?: 'google';
  // Recommended retry delay in milliseconds (for quota/rate limit errors)
  retryDelayMs?: number;
}

/**
 * Error type classification enum
 */
export enum ParsedErrorType {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
  NETWORK = 'NETWORK',
  TERMINAL_QUOTA = 'TERMINAL_QUOTA',
  RETRYABLE_QUOTA = 'RETRYABLE_QUOTA',
  UNKNOWN = 'UNKNOWN',
  // Legacy values for backward compatibility during migration
  PRO_QUOTA = 'PRO_QUOTA',
  GENERIC_QUOTA = 'GENERIC_QUOTA',
  AUTH = 'AUTH',
  GENERIC = 'GENERIC',
}

/**
 * Type guard to check if a ParsedError is an authentication error
 */
export function isAuthError(error: ParsedError): boolean {
  return error.type === ParsedErrorType.AUTH;
}

/**
 * Base fatal error class with exit code
 */
export class FatalError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

/**
 * Fatal authentication error (exit code 41)
 */
export class FatalAuthenticationError extends FatalError {
  constructor(message: string) {
    super(message, 41);
  }
}

/**
 * Fatal input error (exit code 42)
 */
export class FatalInputError extends FatalError {
  constructor(message: string) {
    super(message, 42);
  }
}

/**
 * Fatal sandbox error (exit code 44)
 */
export class FatalSandboxError extends FatalError {
  constructor(message: string) {
    super(message, 44);
  }
}

/**
 * Fatal configuration error (exit code 52)
 */
export class FatalConfigError extends FatalError {
  constructor(message: string) {
    super(message, 52);
  }
}

/**
 * Fatal turn limited error (exit code 53)
 */
export class FatalTurnLimitedError extends FatalError {
  constructor(message: string) {
    super(message, 53);
  }
}

/**
 * Fatal tool execution error (exit code 54)
 */
export class FatalToolExecutionError extends FatalError {
  constructor(message: string) {
    super(message, 54);
  }
}

/**
 * Fatal cancellation error (exit code 130 - standard SIGINT)
 */
export class FatalCancellationError extends FatalError {
  constructor(message: string) {
    super(message, 130); // Standard exit code for SIGINT
  }
}

// Internal interfaces for implementation details
/** @internal */
export interface GaxiosError {
  response?: {
    data?: unknown;
  };
}

/** @internal */
export interface ResponseData {
  error?: {
    code?: number;
    message?: string;
  };
}

// Note: HTTP error classes (UnauthorizedError, ForbiddenError, BadRequestError)
// are deprecated and will be removed. Use ParsedError.statusCode instead.
