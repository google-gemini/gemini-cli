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
  if (typeof errorProp !== 'object' || errorProp === null) {
    return false;
  }

  return (
    'code' in errorProp &&
    typeof errorProp.code === 'number' &&
    'message' in errorProp &&
    typeof errorProp.message === 'string' &&
    'status' in errorProp &&
    typeof errorProp.status === 'string'
  );
}

export function isStructuredError(error: unknown): error is StructuredError {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return false;
  }
  if (typeof error.message !== 'string') {
    return false;
  }
  if ('status' in error && typeof error.status !== 'number') {
    return false;
  }
  return true;
}
