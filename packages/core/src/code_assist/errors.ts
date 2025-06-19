/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GaxiosError } from 'gaxios';

export function isAuthError(error: unknown): boolean {
  return (
    error instanceof GaxiosError && error.response?.data?.error?.code === 401
  );
}
