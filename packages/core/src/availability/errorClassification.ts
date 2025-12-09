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

export function classifyFailureKind(error: unknown): FailureKind {
  if (error instanceof TerminalQuotaError) {
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
