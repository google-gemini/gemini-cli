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
  if (typeof error !== 'object' || error === null || !('error' in error)) {
    return false;
  }
  const errorProp = (error as { error: unknown }).error;
  return (
    typeof errorProp === 'object' &&
    errorProp !== null &&
    'message' in errorProp
  );
}

export function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}
