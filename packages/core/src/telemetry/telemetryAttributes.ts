/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LogAttributes } from '@opentelemetry/api-logs';
import type { Config } from '../config/config.js';
import { UserAccountManager } from '../utils/userAccountManager.js';

export function getCommonAttributes(config: Config): LogAttributes {
  const userAccountManager = new UserAccountManager();
  const email = userAccountManager.getCachedGoogleAccount();
  return {
    'session.id': config.getSessionId(),
    ...(email && { 'user.email': email }),
  };
}
