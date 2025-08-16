/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, ConfigParameters } from '../config/config.js';

/**
 * Default parameters used for {@link FAKE_CONFIG}
 */
export const DEFAULT_CONFIG_PARAMETERS: ConfigParameters = {
  usageStatisticsEnabled: true,
  debugMode: false,
  sessionId: 'test-session-id',
  proxy: undefined,
  model: 'gemini-9001-super-duper',
  targetDir: '/',
  cwd: '/',
};

/**
 * Produces a config.  Default paramters are set to
 * {@link DEFAULT_CONFIG_PARAMETERS}, optionally, fields can be specified to
 * override those defaults.
 */
export function makeFakeConfig(
  config: Partial<ConfigParameters> = {
    ...DEFAULT_CONFIG_PARAMETERS,
  },
): Config {
  return new Config({
    ...DEFAULT_CONFIG_PARAMETERS,
    ...config,
  });
}
