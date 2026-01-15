/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SettingScope,
  isLoadableSettingScope,
  type LoadedSettings,
} from '../config/settings.js';
import type { ModifiedScope } from './skillSettings.js';

export type AgentActionStatus = 'success' | 'no-op' | 'error';

/**
 * Metadata representing the result of an agent settings operation.
 */
export interface AgentActionResult {
  status: AgentActionStatus;
  agentName: string;
  action: 'enable' | 'disable';
  /** Scopes where the agent's state was actually changed. */
  modifiedScopes: ModifiedScope[];
  /** Scopes where the agent was already in the desired state. */
  alreadyInStateScopes: ModifiedScope[];
  /** Error message if status is 'error'. */
  error?: string;
}

/**
 * Enables an agent by ensuring it is not disabled in any writable scope (User and Workspace).
 * It sets `agents.overrides.<agentName>.disabled` to `false` if it was found to be `true`.
 */
export function enableAgent(
  settings: LoadedSettings,
  agentName: string,
): AgentActionResult {
  const writableScopes = [SettingScope.Workspace, SettingScope.User];
  const foundInDisabledScopes: ModifiedScope[] = [];
  const alreadyEnabledScopes: ModifiedScope[] = [];

  for (const scope of writableScopes) {
    if (isLoadableSettingScope(scope)) {
      const scopePath = settings.forScope(scope).path;
      const agentOverrides =
        settings.forScope(scope).settings.agents?.overrides;
      const isDisabled = agentOverrides?.[agentName]?.disabled === true;

      if (isDisabled) {
        foundInDisabledScopes.push({ scope, path: scopePath });
      } else {
        alreadyEnabledScopes.push({ scope, path: scopePath });
      }
    }
  }

  if (foundInDisabledScopes.length === 0) {
    return {
      status: 'no-op',
      agentName,
      action: 'enable',
      modifiedScopes: [],
      alreadyInStateScopes: alreadyEnabledScopes,
    };
  }

  const modifiedScopes: ModifiedScope[] = [];
  for (const { scope, path } of foundInDisabledScopes) {
    if (isLoadableSettingScope(scope)) {
      // Explicitly enable it to override any lower-precedence disables, or just clear the disable.
      // Setting to false ensures it is enabled.
      settings.setValue(scope, `agents.overrides.${agentName}.disabled`, false);
      modifiedScopes.push({ scope, path });
    }
  }

  return {
    status: 'success',
    agentName,
    action: 'enable',
    modifiedScopes,
    alreadyInStateScopes: alreadyEnabledScopes,
  };
}

/**
 * Disables an agent by setting `agents.overrides.<agentName>.disabled` to `true` in the specified scope.
 */
export function disableAgent(
  settings: LoadedSettings,
  agentName: string,
  scope: SettingScope,
): AgentActionResult {
  if (!isLoadableSettingScope(scope)) {
    return {
      status: 'error',
      agentName,
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [],
      error: `Invalid settings scope: ${scope}`,
    };
  }

  const scopePath = settings.forScope(scope).path;
  const agentOverrides = settings.forScope(scope).settings.agents?.overrides;
  const isDisabled = agentOverrides?.[agentName]?.disabled === true;

  if (isDisabled) {
    return {
      status: 'no-op',
      agentName,
      action: 'disable',
      modifiedScopes: [],
      alreadyInStateScopes: [{ scope, path: scopePath }],
    };
  }

  // Check if it's already disabled in the other writable scope
  const otherScope =
    scope === SettingScope.Workspace
      ? SettingScope.User
      : SettingScope.Workspace;
  const alreadyDisabledInOther: ModifiedScope[] = [];

  if (isLoadableSettingScope(otherScope)) {
    const otherOverrides =
      settings.forScope(otherScope).settings.agents?.overrides;
    if (otherOverrides?.[agentName]?.disabled === true) {
      alreadyDisabledInOther.push({
        scope: otherScope,
        path: settings.forScope(otherScope).path,
      });
    }
  }

  settings.setValue(scope, `agents.overrides.${agentName}.disabled`, true);

  return {
    status: 'success',
    agentName,
    action: 'disable',
    modifiedScopes: [{ scope, path: scopePath }],
    alreadyInStateScopes: alreadyDisabledInOther,
  };
}
