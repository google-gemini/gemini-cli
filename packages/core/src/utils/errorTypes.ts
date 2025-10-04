/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Core error types for unified error handling
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
}

export interface ParsedError {
  type: ParsedErrorType;
  message: string;
  statusCode?: number;
  provider?: 'google';
  retryDelayMs?: number;
  cause?: unknown;
}
