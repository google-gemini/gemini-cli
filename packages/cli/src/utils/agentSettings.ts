/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type SettingScope, type LoadedSettings } from '../config/settings.js';
import {
  type FeatureActionResult,
  type FeatureToggleConfig,
  enableFeature,
  disableFeature,
} from './featureToggleUtils.js';

export type AgentActionResult = FeatureActionResult;

/**
 * Agents use an override-based toggle: `agents.overrides.<name>.enabled`
 * is set to `true` or `false`.
 *
 * The enable flow treats a scope as "disabled" when the override is not
 * explicitly `true` (i.e., absent or false).
 * The disable flow treats a scope as "already disabled" only when the
 * override is explicitly `false`.
 */
const agentEnableConfig: FeatureToggleConfig = {
  isDisabledInScope(scopeFile, featureName) {
    return (
      scopeFile.settings.agents?.overrides?.[featureName]?.enabled !== true
    );
  },
  applyEnable(settings, scope, featureName) {
    settings.setValue(scope, `agents.overrides.${featureName}.enabled`, true);
  },
  applyDisable() {
    // Not used via the enable config.
  },
};

const agentDisableConfig: FeatureToggleConfig = {
  isDisabledInScope(scopeFile, featureName) {
    return (
      scopeFile.settings.agents?.overrides?.[featureName]?.enabled === false
    );
  },
  applyEnable() {
    // Not used via the disable config.
  },
  applyDisable(settings, scope, featureName) {
    settings.setValue(scope, `agents.overrides.${featureName}.enabled`, false);
  },
};

/**
 * Enables an agent by ensuring it is enabled in any writable scope (User and Workspace).
 * It sets `agents.overrides.<agentName>.enabled` to `true`.
 */
export function enableAgent(
  settings: LoadedSettings,
  agentName: string,
): AgentActionResult {
  return enableFeature(settings, agentName, agentEnableConfig);
}

/**
 * Disables an agent by setting `agents.overrides.<agentName>.enabled` to `false` in the specified scope.
 */
export function disableAgent(
  settings: LoadedSettings,
  agentName: string,
  scope: SettingScope,
): AgentActionResult {
  return disableFeature(settings, agentName, scope, agentDisableConfig);
}
