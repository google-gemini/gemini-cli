/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';

export const sessionId = randomUUID();

export function createSessionId(): string {
  return randomUUID();
}
