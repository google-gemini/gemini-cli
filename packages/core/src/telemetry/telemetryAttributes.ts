/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Attributes } from '@opentelemetry/api';
import type { Config } from '../config/config.js';
import { InstallationManager } from '../utils/installationManager.js';
import { UserAccountManager } from '../utils/userAccountManager.js';

const userAccountManager = new UserAccountManager();
const installationManager = new InstallationManager();

export function getCommonAttributes(config: Config): Attributes {
  const email = userAccountManager.getCachedGoogleAccount();
  return {
    'session.id': config.getSessionId(),
    'installation.id': installationManager.getInstallationId(),
    ...(email && { 'user.email': email }),
  };
}
