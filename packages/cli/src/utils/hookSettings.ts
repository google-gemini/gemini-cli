/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SettingScope, type LoadedSettings } from '../config/settings.js';
import { getErrorMessage } from '@google/gemini-cli-core';
import {
  type FeatureActionResult,
  enableFeature,
  disableFeature,
  createListBasedToggleConfig,
} from './featureToggleUtils.js';

export type HookActionResult = FeatureActionResult;

const hookToggleConfig = createListBasedToggleConfig(
  'hooksConfig.disabled',
  (scopeFile) => scopeFile.settings.hooksConfig?.disabled,
);

/**
 * Enables a hook by removing it from all writable disabled lists (User and Workspace).
 */
export function enableHook(
  settings: LoadedSettings,
  hookName: string,
): HookActionResult {
  try {
    return enableFeature(settings, hookName, hookToggleConfig);
  } catch (error) {
    return {
      status: 'error',
      featureName: hookName,
      action: 'enable',
      modifiedScopes: [],
      alreadyInStateScopes: [],
      error: `Failed to enable hook: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Disables a hook by adding it to the disabled list in the specified scope.
 */
export function disableHook(
  settings: LoadedSettings,
  hookName: string,
  scope: SettingScope,
): HookActionResult {
  return disableFeature(settings, hookName, scope, hookToggleConfig);
}
