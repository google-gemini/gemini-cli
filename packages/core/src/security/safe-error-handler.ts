/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * Safe error handling utilities to prevent information disclosure.
 *
 * SECURITY NOTE: Exposing detailed error messages, stack traces, or internal
 * system information to users can help attackers understand the application
 * internals and craft targeted attacks.
 *
 * Common information disclosure vectors:
 * - Stack traces revealing file paths, library versions
 * - Error messages exposing database schemas, SQL queries
 * - System errors revealing OS version, configuration
 * - Debug information in production environments
 *
 * This module provides safe error handling that logs details internally
 * but returns sanitized messages to users.
 */

/**
 * Sensitive patterns that should never be exposed in error messages.
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /api[_-]?key/i,
  /secret/i,
  /credential/i,
  /authorization/i,
  /bearer/i,
  /oauth/i,
  /session[_-]?id/i,
  /private[_-]?key/i,
  /aws[_-]?access/i,
  /aws[_-]?secret/i,
  /connection[_-]?string/i,
  /database[_-]?url/i,
];

/**
 * File path patterns that reveal internal structure.
 */
const PATH_PATTERNS = [
  /\/home\/[^/]+/g,
  /\/Users\/[^/]+/g,
  /C:\\Users\\[^\\]+/g,
  /\/var\/[^/]+/g,
  /\/etc\/[^/]+/g,
  /\/opt\/[^/]+/g,
  /node_modules\/.*\//g,
];

/**
 * Options for error sanitization.
 */
export interface ErrorSanitizationOptions {
  /** Include generic error type (default: true) */
  includeType?: boolean;
  /** Include sanitized error message (default: true) */
  includeMessage?: boolean;
  /** Include sanitized stack trace (default: false) */
  includeStack?: boolean;
  /** Log full error details internally (default: true) */
  logInternally?: boolean;
  /** Custom error message to return */
  customMessage?: string;
}

/**
 * Sanitized error interface.
 */
export interface SanitizedError {
  type: string;
  message: string;
  stack?: string;
  timestamp: string;
  requestId?: string;
}

/**
 * Sanitizes an error message by removing sensitive information.
 *
 * @param message Error message to sanitize
 * @returns Sanitized message
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;

  // Remove sensitive information
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(sanitized)) {
      logConfigTamperingDetected(
        'Error message',
        `Prevented disclosure of sensitive information in error message`,
      );
      return 'An error occurred while processing your request';
    }
  }

  // Remove file paths
  for (const pattern of PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[PATH]/');
  }

  // Remove IP addresses
  sanitized = sanitized.replace(
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    '[IP]',
  );

  // Remove ports
  sanitized = sanitized.replace(/:\d{2,5}\b/g, ':[PORT]');

  // Remove email addresses
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[EMAIL]',
  );

  // Remove URLs
  sanitized = sanitized.replace(
    /https?:\/\/[^\s]+/g,
    '[URL]',
  );

  // Truncate if too long
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200) + '...';
  }

  return sanitized;
}

/**
 * Sanitizes a stack trace by removing sensitive information.
 *
 * @param stack Stack trace to sanitize
 * @returns Sanitized stack trace
 */
export function sanitizeStackTrace(stack?: string): string | undefined {
  if (!stack) {
    return undefined;
  }

  let sanitized = stack;

  // Remove file paths but keep function names
  for (const pattern of PATH_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[PATH]/');
  }

  // Remove line numbers (can reveal code structure)
  sanitized = sanitized.replace(/:\d+:\d+/g, ':XX:XX');

  // Only return first 5 lines of stack trace
  const lines = sanitized.split('\n').slice(0, 5);
  return lines.join('\n');
}

/**
 * Safely handles an error by logging full details internally
 * and returning a sanitized version to the user.
 *
 * @param error Error to handle
 * @param options Sanitization options
 * @returns Sanitized error
 */
export function safeHandleError(
  error: unknown,
  options: ErrorSanitizationOptions = {},
): SanitizedError {
  const {
    includeType = true,
    includeMessage = true,
    includeStack = false,
    logInternally = true,
    customMessage,
  } = options;

  // Extract error details
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const errorType = errorObj.name || 'Error';
  const errorMessage = errorObj.message || 'Unknown error';
  const errorStack = errorObj.stack;

  // Log full error internally
  if (logInternally) {
    console.error('[INTERNAL ERROR]', {
      type: errorType,
      message: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
    });
  }

  // Create sanitized error
  const sanitized: SanitizedError = {
    type: includeType ? errorType : 'Error',
    message: customMessage ||
             (includeMessage ? sanitizeErrorMessage(errorMessage) : 'An error occurred'),
    timestamp: new Date().toISOString(),
  };

  // Optionally include sanitized stack trace
  if (includeStack && errorStack) {
    sanitized.stack = sanitizeStackTrace(errorStack);
  }

  return sanitized;
}

/**
 * Creates a safe error response for API responses.
 *
 * @param error Error to handle
 * @param statusCode HTTP status code
 * @returns Safe error response object
 */
export function createSafeErrorResponse(
  error: unknown,
  statusCode: number = 500,
): {
  error: {
    code: number;
    message: string;
    timestamp: string;
  };
} {
  const sanitized = safeHandleError(error, {
    includeType: false,
    includeMessage: true,
    includeStack: false,
  });

  return {
    error: {
      code: statusCode,
      message: sanitized.message,
      timestamp: sanitized.timestamp,
    },
  };
}

/**
 * Detects if an error message contains sensitive information.
 *
 * @param message Error message to check
 * @returns True if sensitive information detected
 */
export function containsSensitiveInfo(message: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Wraps a function with safe error handling.
 *
 * @param fn Function to wrap
 * @param errorHandler Custom error handler
 * @returns Wrapped function
 */
export function withSafeErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  errorHandler?: (error: unknown) => void,
): T {
  return ((...args: Parameters<T>): ReturnType<T> => {
    try {
      const result = fn(...args);

      // Handle async functions
      if (result instanceof Promise) {
        return result.catch((error: unknown) => {
          const sanitized = safeHandleError(error);
          if (errorHandler) {
            errorHandler(sanitized);
          }
          throw new Error(sanitized.message);
        }) as ReturnType<T>;
      }

      return result;
    } catch (error) {
      const sanitized = safeHandleError(error);
      if (errorHandler) {
        errorHandler(sanitized);
      }
      throw new Error(sanitized.message);
    }
  }) as T;
}

/**
 * Safe console.error replacement that prevents sensitive info leakage.
 *
 * @param message Message to log
 * @param data Additional data
 */
export function safeConsoleError(message: string, data?: unknown): void {
  const sanitizedMessage = sanitizeErrorMessage(message);

  if (containsSensitiveInfo(message)) {
    logConfigTamperingDetected(
      'Console output',
      'Prevented sensitive information disclosure in console.error',
    );
  }

  console.error(sanitizedMessage, data);
}

/**
 * Safe console.log replacement that prevents sensitive info leakage.
 *
 * @param message Message to log
 * @param data Additional data
 */
export function safeConsoleLog(message: string, data?: unknown): void {
  const sanitizedMessage = sanitizeErrorMessage(message);

  if (containsSensitiveInfo(message)) {
    logConfigTamperingDetected(
      'Console output',
      'Prevented sensitive information disclosure in console.log',
    );
  }

  console.log(sanitizedMessage, data);
}

/**
 * Production-safe error handler that never exposes internals.
 */
export class ProductionSafeError extends Error {
  constructor(
    message: string = 'An error occurred',
    public readonly internalMessage?: string,
  ) {
    super(message);
    this.name = 'ProductionSafeError';

    // Log internal message if provided
    if (internalMessage) {
      console.error('[INTERNAL]', internalMessage);
    }
  }

  /**
   * Returns only the safe public message.
   */
  public toString(): string {
    return this.message;
  }

  /**
   * Returns only the safe public message (no stack trace).
   */
  public toJSON(): { error: string; timestamp: string } {
    return {
      error: this.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Validates that error messages don't contain sensitive information
 * before throwing them.
 *
 * @param message Error message to validate
 * @returns Safe error message
 */
export function validateErrorMessage(message: string): string {
  if (containsSensitiveInfo(message)) {
    logConfigTamperingDetected(
      'Error message validation',
      `Blocked error message containing sensitive information: ${message.substring(0, 50)}...`,
    );
    return 'An error occurred while processing your request';
  }

  return sanitizeErrorMessage(message);
}
