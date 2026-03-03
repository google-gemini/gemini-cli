/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SettingScope, LoadedSettings } from '../config/settings.js';
import {
  type FeatureActionResult,
  type FeatureToggleStrategy,
  enableFeature,
  disableFeature,
} from './featureToggleUtils.js';

export type AgentActionStatus = 'success' | 'no-op' | 'error';

/**
 * Metadata representing the result of an agent settings operation.
 */
export interface AgentActionResult
  extends Omit<FeatureActionResult, 'featureName'> {
  agentName: string;
}

const agentStrategy: FeatureToggleStrategy = {
  needsEnabling: (settings, scope, agentName) => {
    const agentOverrides = settings.forScope(scope).settings.agents?.overrides;
    return agentOverrides?.[agentName]?.enabled !== true;
  },
  enable: (settings, scope, agentName) => {
    settings.setValue(scope, `agents.overrides.${agentName}.enabled`, true);
  },
  isExplicitlyDisabled: (settings, scope, agentName) => {
    const agentOverrides = settings.forScope(scope).settings.agents?.overrides;
    return agentOverrides?.[agentName]?.enabled === false;
  },
  disable: (settings, scope, agentName) => {
    settings.setValue(scope, `agents.overrides.${agentName}.enabled`, false);
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
  const { featureName, ...rest } = enableFeature(
    settings,
    agentName,
    agentStrategy,
  );
  return {
    ...rest,
    agentName: featureName,
  };
}

/**
 * Disables an agent by setting `agents.overrides.<agentName>.enabled` to `false` in the specified scope.
 */
export function disableAgent(
  settings: LoadedSettings,
  agentName: string,
  scope: SettingScope,
): AgentActionResult {
  const { featureName, ...rest } = disableFeature(
    settings,
    agentName,
    scope,
    agentStrategy,
  );
  return {
    ...rest,
    agentName: featureName,
  };
}
