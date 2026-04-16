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

export function getCommonMetricAttributes(config: Config): Attributes {
  const authType = config.getContentGeneratorConfig()?.authType;

  return {
    interactive: config.isInteractive(),
    ...(authType && { auth_type: authType }),
  };
}

export function getCommonAttributes(config: Config): Attributes {
  const email = userAccountManager.getCachedGoogleAccount();
  const experiments = config.getExperiments();

  let experimentsIdsStr = '';
  if (experiments && experiments.experimentIds.length > 0) {
    experimentsIdsStr = experiments.experimentIds.join(',');
    if (experimentsIdsStr.length > 1000) {
      experimentsIdsStr = experimentsIdsStr.substring(0, 1000);
      const lastCommaIndex = experimentsIdsStr.lastIndexOf(',');
      if (lastCommaIndex > 0) {
        experimentsIdsStr = experimentsIdsStr.substring(0, lastCommaIndex);
      }
    }
  }

  return {
    ...getCommonMetricAttributes(config),
    'session.id': config.getSessionId(),
    'installation.id': installationManager.getInstallationId(),
    ...(email && { 'user.email': email }),
    ...(experimentsIdsStr && { 'experiments.ids': experimentsIdsStr }),
  };
}
