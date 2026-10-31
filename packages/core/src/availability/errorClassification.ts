/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TerminalQuotaError,
  RetryableQuotaError,
} from '../utils/googleQuotaErrors.js';
import { ModelNotFoundError } from '../utils/httpErrors.js';
import type { FailureKind } from './modelPolicy.js';

export function isCapacityQuotaError(error: TerminalQuotaError): boolean {
  return (
    error.reason === 'MODEL_CAPACITY_EXHAUSTED' ||
    error.reason === 'MODEL_CAPACITY_EXCEEDED' ||
    /exhausted your capacity|capacity exceeded|MODEL_CAPACITY_EXHAUSTED/i.test(
      error.message,
    )
  );
}

export function classifyFailureKind(error: unknown): FailureKind {
  if (error instanceof TerminalQuotaError) {
    if (isCapacityQuotaError(error)) {
      return 'transient';
    }
    return 'terminal';
  }
  if (error instanceof RetryableQuotaError) {
    return 'transient';
  }
  if (error instanceof ModelNotFoundError) {
    return 'not_found';
  }
  return 'unknown';
}
