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
  const inner: unknown = error.error;
  if (
    typeof inner !== 'object' ||
    inner === null ||
    !('code' in inner) ||
    !('message' in inner) ||
    !('status' in inner) ||
    !('details' in inner)
  ) {
    return false;
  }
  const obj = inner as Record<string, unknown>;
  return (
    typeof obj.code === 'number' &&
    typeof obj.message === 'string' &&
    typeof obj.status === 'string' &&
    Array.isArray(obj.details)
  );
}

export function isStructuredError(error: unknown): error is StructuredError {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return false;
  }
  const msg: unknown = error.message;
  return typeof msg === 'string';
}
