/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StructuredError } from '../core/turn.js';

export interface ApiError {
  error: {
    code: number;
    message: string;
    status: string;
    details: unknown[];
  };
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    typeof (error as ApiError).error === 'object' &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    'message' in (error as ApiError).error
  );
}

export function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    typeof (error as StructuredError).message === 'string'
  );
}
